---
title: "Can TypeScript know a file is still open after await?"
description: "A proposal for checking TypeScript lifecycle protocols in the presence of aliases and asynchronous interference."
date: 2026-09-12
kind: Research proposal
---

An object can have all the right methods and still be used at the wrong time. A connection exposes `send`, but sending before connecting may be invalid. A transaction exposes `query`, but querying after committing may violate its contract. A file handle exposes `read`, but reading after closing it may fail.

These are questions about an object's history: what has happened to it, and which operations are permitted next?

My research asks how a static analyzer could check these lifecycle rules in TypeScript, especially across `await`. The difficulty is that an object can change while a function is suspended, even when the awaited computation has no reference to it.

## From data shapes to object protocols

Consider a toy file API with three operations: `open()`, `read()`, and `close()`. Each handle starts closed and follows this protocol:

| Current state | Operation | Next state |
| --- | --- | --- |
| Closed | `open()` | Open |
| Open | `read()` | Open |
| Open | `close()` | Closed |

Every operation missing from the table is forbidden. Reading a closed handle is invalid, as is opening an already open one. A real API might allow repeated calls; its specification would need to say so.

This is a **typestate protocol**: the operations permitted on an object depend on its state. A checker can follow the transitions through straight-line code and flag a read after a close.

TypeScript APIs can encode some lifecycle constraints using distinct state types and wrappers. My proposed analyzer starts with existing mutable-object code and an explicit protocol specification. Limiting the source changes needed to adopt it is a goal to evaluate.

## The callback the awaited expression cannot see

Here is a complete example. The resource operations are synchronous so that the only suspension comes from `await`. `FileHandle` is a toy class, not Node.js's file API.

```ts
class FileHandle {
  private state: "Closed" | "Open" = "Closed";

  open(): void {
    if (this.state !== "Closed") {
      throw new Error("Cannot open an open handle");
    }
    this.state = "Open";
  }

  read(): string {
    if (this.state !== "Open") {
      throw new Error("Cannot read a closed handle");
    }
    return "contents";
  }

  close(): void {
    if (this.state !== "Open") {
      throw new Error("Cannot close a closed handle");
    }
    this.state = "Closed";
  }
}

async function example(): Promise<string> {
  const file = new FileHandle();
  file.open();

  Promise.resolve().then(() => file.close());

  await Promise.resolve(0);

  return file.read();
}

example().catch(error => console.error(error.message));
// Cannot read a closed handle
```

The close callback is queued before the continuation following `await`. Execution proceeds in this order:

1. Open the handle.
2. Queue a callback that holds a reference to it.
3. Suspend at `await`.
4. Run the callback and close the handle.
5. Resume and attempt to read.

Even an already fulfilled promise does not make `await` synchronous. Resumption follows JavaScript's asynchronous job machinery, as specified by [ECMAScript's Await operation](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#await).

The awaited expression is just `Promise.resolve(0)`. It neither receives nor captures `file`.

My original proposal considered preserving an object's state whenever it lay outside the awaited expression's **footprint**: the objects that expression could reach. This example breaks that rule. A previously scheduled callback already has an alias and can act independently of the awaited expression.

The research question is therefore:

> Under what statically checkable conditions can an object's protocol state be preserved across `await`, despite aliases held by computations that may run before resumption?

## What would justify keeping a fact?

I use **interference** to mean the effects of other computations on facts the current computation relies on. Here, the fact is “this handle is Open”; the interfering effect is the callback's transition to Closed.

An analyzer must consider the computations that can run before resumption. Depending on the environment it supports, these may include registered callbacks, promise continuations, event handlers, and work they schedule in turn. Unknown library behavior needs an explicit treatment too.

There are three useful starting cases:

| During suspension | Evidence needed to preserve the state |
| --- | --- |
| No intervening computation can reach the object | A confinement argument |
| Another computation can reach it but preserves its state | A summary of its relevant effects |
| Another computation may change its state, or has unknown effects | Further evidence; preservation is not yet justified |

A local variable does not establish confinement: the closure in the example captures the object. Nor is a callback's name evidence of its effects. A method called `read` might consume a resource or invoke another callback.

The proposed rule is about **stability under every modeled intervening effect**. Finding an approximation that is both safe and practical to compute is the research work.

## State belongs to objects, not variable names

Aliases matter even in sequential code:

```ts
const first = new FileHandle();
const second = first;

first.open();
second.close();
first.read(); // Same object, now Closed
```

The analysis needs to attach protocol facts to abstract object identities. Variables and field paths describe how code reaches those objects.

**Must-alias** information says two references definitely identify the same object; **may-alias** information says they might. A definite update to one precisely represented object can replace its previous state. An uncertain update may need to retain several possibilities. Even a single abstract identity can represent multiple runtime objects, so a singleton points-to set alone does not justify replacing all its state information.

Field assignments complicate reachability:

```ts
const previous = holder.file;
holder.file = replacement;
```

Facts about the old object cannot simply transfer to `replacement`, while `previous` may still refer to the original object. This motivates bounded field paths, abstract heap identities, and explicit rules for reassignment.

## Making uncertainty visible

A checker often cannot establish one exact state. If one branch closes an open file and another leaves it open, the joined state set is `{Open, Closed}`. A read requires Open, so it cannot be verified for every represented execution.

Suspension can introduce the same uncertainty. If a callback might close an object, both states may remain possible. If its effects are unknown, the analyzer may need a broader approximation or an explicit unverified result.

The intended outcomes are:

- **Verified:** the operation is permitted in every represented state, under the analysis's stated assumptions.
- **Possible protocol violation:** at least one represented state forbids the operation.
- **Unverified:** unsupported syntax or behavior prevents the required reasoning.

A possible violation is not necessarily a runtime bug. Diagnostics should explain what weakened the evidence: a branch, an alias, a field assignment, an unknown call, or an `await`.

Asynchronous resource methods add another boundary. Calling an async `open()` might move a handle from Closed to Opening, with fulfilment moving it to Open and rejection moving it to an API-specific failure state. The contract must specify those transitions. Successful completion alone does not establish that the handle remains open until the caller resumes.

Function summaries will therefore need to distinguish normal returns, exceptions, fulfilment, rejection, returned aliases, and callback effects. One input-to-output state transition cannot express all of these cases.

## The proposed contribution

Typestate and alias analysis have substantial foundations. [Bierhoff and Aldrich](https://www.cs.cmu.edu/~kbierhof/papers/typestate-verification.pdf) combine typestate and aliasing information through access permissions for modular checking. [Fink and colleagues](https://www.microsoft.com/en-us/research/publication/effective-typestate-verification-presence-aliasing/) investigate verification in the presence of aliases. [Papaya](https://arxiv.org/abs/2107.13101) studies global typestate analysis with unrestricted aliasing.

Asynchronous JavaScript analysis is also established work. [Sotiropoulos and Livshits](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ECOOP.2019.8) use callback graphs to capture asynchronous data flow and execution ordering. [STScript](https://arxiv.org/abs/2101.04622) addresses communication safety in TypeScript through multiparty session types.

My candidate contribution is an interference abstraction for preserving object-protocol facts across TypeScript suspension points, with evidence about its usefulness and cost. Its exact novelty still needs careful comparison with these and related approaches.

The proposal has three connected outputs:

1. **An empirical corpus:** concrete TypeScript lifecycle protocols, how their objects escape, and how they interact with `await`.
2. **A formal model:** a small language with explicit heap and scheduling semantics, together with a protocol-safety result under stated assumptions.
3. **An evaluated analyzer:** an implementation measured against simpler preservation policies.

## A guarantee with a defined scope

The target safety statement is:

> For an accepted program in the supported core, if protocol specifications correctly describe operations and the analysis covers every permitted execution, no execution performs an operation forbidden by its protocol state.

This is a proposed theorem, not an established result. Extending it to TypeScript source also requires a justified translation, library models, host scheduling assumptions, and explicit handling of unsupported features.

The [initial calculus, TS₀]({{ '/research/initial-calculus/' | relative_url }}), is a proposed sequential foundation with allocation, aliases, method calls, and branches. It includes base typing and explicit proof obligations; it does not claim an executable semantics or completed proof. Suspension and pending jobs require an extension with their own semantics.

The first model will have a limited scope. Structural subtyping, prototype mutation, computed properties, and shared-memory workers will not all be included. Unknown calls, getters, native code, and type-system escape hatches cannot silently preserve facts they might invalidate.

Protocol safety also does not imply eventual cleanup, completion, or freedom from deadlock. An executable semantics and generated examples can help find counterexamples; passing those tests cannot replace a proof.

## How I plan to evaluate it

I will compare three policies on the same programs:

| Policy | What survives `await`? |
| --- | --- |
| Conservative baseline | No previously established protocol-state facts |
| Confinement only | Facts about objects proven unreachable by intervening computations |
| Interference summaries | Additional facts proven stable under modeled effects |

The original awaited-expression footprint rule can serve as a deliberately unsound comparator, with missed violations reported explicitly.

The evaluation will measure whether extra preservation verifies later operations, how often warnings identify real violations, how many known violations are detected, and how much code remains unverified. It will also record runtime, memory use, and the effort required to specify protocols. Coverage matters: avoiding difficult code must not make an analyzer appear more successful.

The planned corpus starts with two libraries and at least 20 candidate protocols. Selection will depend on identifiable lifecycle contracts and inspectable evidence. Exact commits, exclusions, labels, and experiment configurations will be recorded.

## Next steps

The proposed safety theorem remains a proof obligation. The next steps are to make the sequential model executable, develop a control-flow graph and worklist solver, and construct paired safe and unsafe suspension examples to challenge the interference rules.

The question remains concrete: **when a function resumes, what evidence is sufficient to keep trusting the protocol facts it knew before suspension?** Confinement may cover most practical cases, or richer summaries may justify their cost. The evaluation needs to distinguish those outcomes.
