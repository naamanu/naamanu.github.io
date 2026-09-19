---
title: "TS₀: An Initial Calculus for Typestate Verification"
description: "A sequential foundation for interference-aware TypeScript analysis, with base typing and explicit proof obligations."
date: 2026-09-19
kind: Research note
math: true
---

**Status:** Revised semantic design with base typing and explicit proof obligations. No executable TS₀ semantics or mechanized proof is claimed.

Companion reading: [Can TypeScript Know a File Is Still Open After await?]({{ '/research/typestate-typescript/' | relative_url }})

We start with a small sequential language of protocol-bearing objects. It can express allocation, aliases, method calls, and branches—the ingredients we need to understand before adding suspension and pending jobs.

## 1. Define the object protocols

A protocol describes which operations are legal in each state:

$$
P = (Q,\ q_0,\ M,\ \delta)
$$

- <span markdown="0">\(Q\)</span> is a finite set of states.
- <span markdown="0">\(q_0 \in Q\)</span> is the initial state.
- <span markdown="0">\(M\)</span> is the set of method names.
- <span markdown="0">\(\delta : Q \times M \rightharpoonup Q\)</span> is a **partial** transition function.

“Partial” means some state–method combinations have no result: those calls are forbidden. Fix a finite catalog <span markdown="0">\(\mathcal C\)</span> mapping names <span markdown="0">\(P\)</span> to tuples <span markdown="0">\((Q_P,q_0^P,M_P,\delta_P)\)</span>. Require finite <span markdown="0">\(M_P\)</span>, <span markdown="0">\(q_0^P\in Q_P\)</span>, and every defined transition to stay in <span markdown="0">\(Q_P\)</span>. Names <span markdown="0">\(P\)</span> range over <span markdown="0">\(\operatorname{dom}(\mathcal C)\)</span> throughout; unknown protocol names are rejected before execution. Locations come from a countably infinite set, so allocation from a finite heap always has a fresh choice.

For our file protocol, <span markdown="0">\(q_0^{\mathrm{File}}=\mathrm{Closed}\)</span> and <span markdown="0">\(M_{\mathrm{File}}=\{\mathrm{open},\mathrm{read},\mathrm{close}\}\)</span>:

| Current state | Method | Next state |
| --- | --- | --- |
| Closed | open | Open |
| Open | read | Open |
| Open | close | Closed |

For example:

$$
\delta_{\mathrm{File}}(\mathrm{Open},\mathrm{close})
= \mathrm{Closed}
$$

But <span markdown="0">\(\delta_{\mathrm{File}}(\mathrm{Closed},\mathrm{read})\)</span> is undefined.

For this initial model, methods are **primitive protocol operations**. We assume their specifications are correct and abstract away their implementations and returned data. Every successful primitive call returns unit. A primitive operation is atomic, modifies only its receiver's protocol state, and neither invokes callbacks nor allocates objects. In particular, a read models permission to read, without modeling file contents.

## 2. Give the language a grammar

Expressions are:

$$
\begin{aligned}
e ::= {}&
x
\mid v
\mid \operatorname{new}\ P\\
&\mid \operatorname{let}\ x=e\ \operatorname{in}\ e\\
&\mid e.m()\\
&\mid \operatorname{if}\ e\ \operatorname{then}\ e\ \operatorname{else}\ e
\end{aligned}
$$

Values are:

$$
v ::= \ell \mid \mathrm{true} \mid \mathrm{false} \mid ()
$$

| Symbol | Meaning |
| --- | --- |
| <span markdown="0">\(x\)</span> | Variable |
| <span markdown="0">\(\ell\)</span> | Heap location—an object's identity |
| <span markdown="0">\(\operatorname{new}\ P\)</span> | Allocate an object following protocol <span markdown="0">\(P\)</span> |
| <span markdown="0">\(\operatorname{let}\ x=e_1\ \operatorname{in}\ e_2\)</span> | Evaluate <span markdown="0">\(e_1\)</span>, bind its result, then evaluate <span markdown="0">\(e_2\)</span> |
| <span markdown="0">\(e.m()\)</span> | Invoke a protocol operation |
| <span markdown="0">\(()\)</span> | Unit: no meaningful result |

Locations appear during execution; programmers do not write them directly. Source programs are closed expressions without literal locations, evaluated initially with an empty heap.

Sequencing is shorthand:

$$
e_1;e_2
\quad\equiv\quad
\operatorname{let}\ z=e_1\ \operatorname{in}\ e_2
$$

where <span markdown="0">\(z\)</span> is fresh and unused. Sequences associate to the right.

A program then looks like:

~~~text
let file = new File in
  file.open();
  file.read();
  file.close()
~~~

Version zero has no fields, functions, loops, exceptions, promises, or async operations. Those extensions should receive their own rules instead of being implicit in the notation.

## 3. Define what exists at runtime

An execution configuration contains a heap and an expression:

$$
\langle H,e\rangle
$$

The heap is a finite partial map from locations to protocols and current states:

$$
H : \mathrm{Location}
\rightharpoonup
(\mathrm{Protocol}\times\mathrm{State})
$$

For example:

$$
H =
\{
\ell_1 \mapsto (\mathrm{File},\mathrm{Open}),
\ell_2 \mapsto (\mathrm{File},\mathrm{Closed})
\}
$$

These are two distinct objects, even though both follow the same protocol.

This is the first essential choice: **state belongs to an object identity, not to a variable name.**

A well-formed heap assigns each object a state belonging to its protocol. Every location occurring in the current expression must exist in the heap.


Heaps only grow by allocation; there is no deallocation or location reuse.

### Base typing: distinguish malformed programs from protocol failures

Base types record value shape and protocol membership, without recording current protocol state:

$$
\tau ::= \mathrm{Bool}\mid\mathrm{Unit}\mid\operatorname{Obj}(P)
$$

Let <span markdown="0">\(\Delta\)</span> map variables to base types and <span markdown="0">\(\Psi\)</span> map allocated locations to protocol names. The judgment <span markdown="0">\(\Delta;\Psi\vdash e:\tau\)</span> uses the fixed catalog <span markdown="0">\(\mathcal C\)</span>. These environments are separate from the flow-sensitive information in Section 7.

$$
\frac{\Delta(x)=\tau}{\Delta;\Psi\vdash x:\tau}
\qquad
\frac{\Psi(\ell)=P}{\Delta;\Psi\vdash\ell:\operatorname{Obj}(P)}
$$

$$
\frac{b\in\{\mathrm{true},\mathrm{false}\}}
{\Delta;\Psi\vdash b:\mathrm{Bool}}
\qquad
\frac{}{\Delta;\Psi\vdash():\mathrm{Unit}}
\qquad
\frac{P\in\operatorname{dom}(\mathcal C)}
{\Delta;\Psi\vdash\operatorname{new}\ P:\operatorname{Obj}(P)}
$$

$$
\frac{
\Delta;\Psi\vdash e_1:\tau_1
\qquad
\Delta[x\mapsto\tau_1];\Psi\vdash e_2:\tau_2
}{
\Delta;\Psi\vdash
\operatorname{let}\ x=e_1\ \operatorname{in}\ e_2:\tau_2
}
$$

$$
\frac{
\Delta;\Psi\vdash e:\operatorname{Obj}(P)
\qquad m\in M_P
}{
\Delta;\Psi\vdash e.m():\mathrm{Unit}
}
$$

$$
\frac{
\Delta;\Psi\vdash e_g:\mathrm{Bool}
\qquad
\Delta;\Psi\vdash e_1:\tau
\qquad
\Delta;\Psi\vdash e_2:\tau
}{
\Delta;\Psi\vdash
\operatorname{if}\ e_g\ \operatorname{then}\ e_1\ \operatorname{else}\ e_2:\tau
}
$$

Both branches must have the same base type, including the same protocol when returning objects. There are no implicit coercions or union types. Shadowing replaces a variable's binding only within the let body.

Write <span markdown="0">\(H:\Psi\)</span> when their domains agree and, for each <span markdown="0">\(\ell\)</span>, <span markdown="0">\(\Psi(\ell)=P\)</span> and <span markdown="0">\(H(\ell)=(P,q)\)</span> with <span markdown="0">\(q\in Q_P\)</span>. A typed runtime configuration satisfies <span markdown="0">\(H:\Psi\)</span> and <span markdown="0">\(\varnothing;\Psi\vdash e:\tau\)</span>. An admitted source program satisfies <span markdown="0">\(\varnothing;\varnothing\vdash e:\tau\)</span> and contains no literal locations.

Thus a Boolean receiver, a unit guard, and a method outside <span markdown="0">\(M_P\)</span> are rejected by base typing. But allocating a File and immediately reading it is base-typed and reaches a protocol error: membership in an API does not establish permission to call it in the current state.

## 4. Define execution one step at a time

We write:

$$
\langle H,e\rangle
\longrightarrow
\langle H',e'\rangle
$$

to mean that one execution step changes the expression and possibly the heap. There is also a terminal outcome <span markdown="0">\(\operatorname{ProtocolError}(\ell,q,m)\)</span>. The rules below define a root reduction <span markdown="0">\(\rightsquigarrow\)</span>; Section 5 closes it under evaluation contexts to define <span markdown="0">\(\longrightarrow\)</span>. Values and protocol errors have no outgoing steps.

### Allocation

Allocate a fresh location in the protocol's initial state:

$$
\frac{
\ell\notin\operatorname{dom}(H)
}{
\langle H,\operatorname{new}\ P\rangle
\rightsquigarrow
\langle H[\ell\mapsto(P,q_0^P)],\ell\rangle
}
$$

The notation <span markdown="0">\(H[\ell\mapsto \dots]\)</span> means “the heap with this entry added or updated.” Fresh-location choices are equivalent up to consistent renaming of locations.

### Binding

Once the bound expression is a value, substitute it into the body:

$$
\langle H,\operatorname{let}\ x=v\ \operatorname{in}\ e\rangle
\rightsquigarrow
\langle H,e[v/x]\rangle
$$

Substitution is capture-avoiding: it respects variable scope.

For example:

~~~text
let file = ℓ₁ in file.open()
~~~

becomes:

~~~text
ℓ₁.open()
~~~

### Legal method call

Look up the object's state and apply its transition:

$$
\frac{
H(\ell)=(P,q)
\qquad
\delta_P(q,m)=q'
}{
\langle H,\ell.m()\rangle
\rightsquigarrow
\langle H[\ell\mapsto(P,q')],()\rangle
}
$$

Calling close on an open file therefore updates that object to Closed.

### Illegal method call

Make protocol failure explicit:

$$
\frac{
H(\ell)=(P,q)
\qquad
\delta_P(q,m)\text{ is undefined}
}{
\langle H,\ell.m()\rangle
\rightsquigarrow
\operatorname{ProtocolError}(\ell,q,m)
}
$$

The error identifies the object, its state, and the forbidden operation. There is no error recovery in this calculus.

### Branches

$$
\langle H,\operatorname{if}\ \mathrm{true}
\ \operatorname{then}\ e_1\ \operatorname{else}\ e_2\rangle
\rightsquigarrow
\langle H,e_1\rangle
$$

$$
\langle H,\operatorname{if}\ \mathrm{false}
\ \operatorname{then}\ e_1\ \operatorname{else}\ e_2\rangle
\rightsquigarrow
\langle H,e_2\rangle
$$

Only the selected branch executes.

On arbitrary raw terms, malformed receivers and guards still have no reduction rule. Section 3's base typing excludes them from admitted source programs. The raw illegal-call rule also covers names outside <span markdown="0">\(M_P\)</span>, but such calls cannot occur in a base-typed program.

## 5. Specify where the next step happens

Evaluation contexts tell us where to apply a rule inside a larger program:

$$
E ::= [\,]
\mid \operatorname{let}\ x=E\ \operatorname{in}\ e
\mid E.m()
\mid \operatorname{if}\ E\ \operatorname{then}\ e\ \operatorname{else}\ e
$$

The hole <span markdown="0">\([\,]\)</span> marks the next expression to evaluate. In this example, brackets highlight the active expression rather than introduce source syntax:

~~~text
let file = [new File] in file.open()
~~~

The allocation executes before the body.

Lift a successful step into its surrounding context:

$$
\frac{
\langle H,e\rangle\rightsquigarrow\langle H',e'\rangle
}{
\langle H,E[e]\rangle\longrightarrow\langle H',E[e']\rangle
}
$$

An error in the active hole terminates the whole configuration:

$$
\frac{
\langle H,e\rangle\rightsquigarrow\operatorname{ProtocolError}(\ell,q,m)
}{
\langle H,E[e]\rangle\longrightarrow\operatorname{ProtocolError}(\ell,q,m)
}
$$

This is a standard evaluation-context presentation, and it maps naturally to [PLT Redex reduction relations](https://docs.racket-lang.org/redex/Reduction_Relations.html). A final configuration contains a value and a heap; a protocol error is a separate terminal outcome. Context closure applies to root reductions. Neither a let body nor an unselected branch executes early.

## 6. Aliasing already falls out of these rules

Consider:

~~~text
let first = new File in
let second = first in
  first.open();
  second.close();
  first.read()
~~~

Allocation produces a fresh location, say <span markdown="0">\(\ell_1\)</span>. Substitution makes both bindings refer to it:

~~~text
ℓ₁.open();
ℓ₁.close();
ℓ₁.read()
~~~

The execution is:

| Operation | Heap state afterward |
| --- | --- |
| Allocate | <span markdown="0">\(H(\ell_1)=(\mathrm{File},\mathrm{Closed})\)</span> |
| first.open() | <span markdown="0">\(H(\ell_1)=(\mathrm{File},\mathrm{Open})\)</span> |
| second.close() | <span markdown="0">\(H(\ell_1)=(\mathrm{File},\mathrm{Closed})\)</span> |
| first.read() | Protocol error |

We do not need a special runtime rule for aliases. **Two references alias because they contain the same location.**

The hard problem comes later: approximating those identities statically.

## 7. Keep execution semantics separate from the checker

The rules above describe what programs do. They do not yet describe how to verify programs without executing them.

### Abstract references and call transfer

A future checker needs sets of possible targets, because a branch can return either of two objects:

$$
\Gamma(x)=\operatorname{Ref}(A)
\qquad
\Sigma(a)=(P_a,S_a)
$$

Here <span markdown="0">\(A\)</span> is a finite set of abstract identities, and <span markdown="0">\(S_a\subseteq Q_{P_a}\)</span> contains possible states. Boolean and unit bindings require their own abstract values; <span markdown="0">\(\Gamma\)</span> is not an environment containing only references. Receiver expressions must also produce abstract values: restricting lookup to variables would not handle the grammar's general <span markdown="0">\(e.m()\)</span> form.

For a reachable receiver, require <span markdown="0">\(A\ne\varnothing\)</span> and, for every <span markdown="0">\(a\in A\)</span>, a defined heap entry with <span markdown="0">\(S_a\ne\varnothing\)</span>. Missing targets are an analysis failure, not an empty set of obligations. Reserve a separate bottom element <span markdown="0">\(\bot\)</span> for unreachable configurations.

After analyzing the receiver expression and all of its effects, verification requires:

$$
\forall a\in A,\ \forall q\in S_a,\quad
\delta_{P_a}(q,m)\text{ is defined}
$$

Checking only one possible target is insufficient. If the condition fails, report a possible protocol violation; do not silently discard forbidden states and report the call as verified.

For a verified call define:

$$
T_m(a)=\{\delta_{P_a}(q,m)\mid q\in S_a\}
$$

A **strong update** is permitted when <span markdown="0">\(A=\{a\}\)</span>, the receiver definitely denotes the object represented by <span markdown="0">\(a\)</span>, and <span markdown="0">\(a\)</span> represents at most one allocated object in each represented concrete heap. Then replace that object's state set with <span markdown="0">\(T_m(a)\)</span>.

Otherwise use a **weak update** for each possible target:

$$
S'_a=
\begin{cases}
S_a\cup T_m(a) & a\in A\\
S_a & a\notin A
\end{cases}
$$

Keep protocol tags unchanged. The old states remain because a may-target might not be selected, or an abstract identity might summarize other objects not modified by this call. Even <span markdown="0">\(A=\{a\}\)</span> does not justify a strong update when <span markdown="0">\(a\)</span> summarizes several objects.

The result of a successful call is abstract unit. Effects of the receiver expression precede this update: if a receiver closes an object before returning it, a subsequent read must be checked against the state after close.

### Allocation, scope, and joins

An allocation-site abstraction can assign a distinct identity to each syntactic allocation. In this loop-free, function-free core, each site executes at most once per run. A reachable allocation can therefore initialize its site's state to <span markdown="0">\(\{q_0^P\}\)</span> without summarizing multiple objects in that run. This argument must be revisited when adding loops, functions, or other repeated evaluation.

A let analyzes its bound expression first, binds its abstract result in the body, and restores any shadowed variable binding when leaving the scope. Heap effects persist. Dropping a variable binding does not delete its object: another reference, including the result of the body, may still reach it.

A conditional analyzes its guard first. Both feasible branches start from the **same post-guard state**, not from one another's output. A known Boolean can select one branch; an unknown Boolean requires both. Join returned abstract values as well as heaps:

$$
\operatorname{Ref}(A_1)\sqcup\operatorname{Ref}(A_2)
=\operatorname{Ref}(A_1\cup A_2)
$$

For a shared identity with the same protocol tag, join state sets by union. For heaps with different domains, retain entries from either branch; an absent entry means the object was not allocated on that path, not that it has an unknown protocol state. References must conservatively retain every possible target, and any later strong update still needs the definite-target condition above. Allocation-site identities from different sites must not be conflated merely because their protocols agree.

For example, after a branch returning either an Open object or a Closed object, the receiver's target set includes both identities. Its read cannot be verified even though one target permits it. Joining both branch heaps but retaining only one returned identity would miss this violation.

Closed TS₀ programs have no external Boolean input: their guards are determined by evaluation. Unknown guards describe a loss of precision in the analyzer, or a future explicitly modeled input extension; they are not runtime nondeterminism added by this grammar.

These transfer constraints repair the earlier sketch, but **are not a complete analyzer definition**. The remaining work is to define the abstract configuration domain, Boolean abstraction, expression judgments, joins and allocation transfers formally, and prove their concrete-to-abstract simulation. An implementation must return unverified for missing analysis rules.

### Proof obligations and the safety boundary

For the operational core and base typing, the intended lemmas are:

1. **Substitution and heap extension.** Substituting a value of the bound type preserves typing; adding a fresh location binding preserves existing expression typing.
2. **Preservation on successful steps.** If <span markdown="0">\(H:\Psi\)</span>, <span markdown="0">\(\varnothing;\Psi\vdash e:\tau\)</span>, and <span markdown="0">\(\langle H,e\rangle\longrightarrow\langle H',e'\rangle\)</span>, then some <span markdown="0">\(\Psi'\supseteq\Psi\)</span> satisfies <span markdown="0">\(H':\Psi'\)</span> and <span markdown="0">\(\varnothing;\Psi'\vdash e':\tau\)</span>.
3. **Progress allowing protocol failure.** A typed configuration is a value configuration, takes a successful step, or steps to a protocol error. Base typing does not exclude the third case.
4. **Determinism up to fresh-location renaming.** The active redex is fixed by the evaluation contexts; only the name selected by allocation varies.

For the future checker, define a representation relation in which every concrete reference is included among its abstract targets and every allocated concrete object's current state occurs in the corresponding abstract state set. Then establish initial-state coverage and a simulation lemma: every concrete step is covered by abstract execution, with error outcomes accounted for.

Only after those obligations are discharged can the intended protocol-safety theorem be claimed:

> If a closed, base-typed TS₀ program is verified by the defined checker from the empty initial state, then no execution from that state reaches ProtocolError.

These are proof obligations, not completed proofs. The theorem would concern correctly specified primitive operations in TS₀; a TypeScript guarantee additionally needs a sound translation and library models. It would not guarantee resource cleanup: allocating a File and opening it terminates safely with an Open object. No accepting/final-state condition is imposed here.

## 8. Add the feature that makes this research

Once <span markdown="0">\(TS_0\)</span> is stable, the async version changes the configuration to include:

$$
\langle
H,\ \text{current computation},\
\text{pending jobs},\
\text{promises and suspended continuations}
\rangle
$$

Suspension can then allow another computation to modify the **same heap** before the original computation resumes.

The existing allocation and protocol-transition rules remain useful. The new obligations are to define scheduling, suspension, fulfilment, rejection, and which heap facts survive intervening execution. This configuration is an extension sketch, not a complete async semantics.

The first concrete milestone is small: encode <span markdown="0">\(TS_0\)</span>, execute valid and invalid traces, and demonstrate the alias example above. It gives us an exact semantic foundation against which to test the eventual static checker and async extension.

## Worked evaluation-order checks

A receiver may itself have effects:

~~~text
let f = new File in
  f.open();
  (let ignored = f.close() in f).read()
~~~

After allocation and open, the receiver first reduces the close call, changing the same location to Closed. The inner binding then returns that location. The final read reaches ProtocolError in Closed. Looking up the receiver's state before evaluating it would be wrong.

Guards may also have effects:

~~~text
let f = new File in
  if (let ignored = f.open() in true)
  then f.read()
  else f.close()
~~~

The guard opens the object before selecting the then branch. The program finishes with unit and an Open object. The else branch is base-typed but is never executed.

Shadowing changes bindings, not identities:

~~~text
let f = new File in
  f.open();
  (let f = new File in f.open());
  f.read()
~~~

The inner allocation creates a distinct location. Capture-avoiding substitution leaves the inner binding intact while replacing outer uses of f. Both objects finish Open, and the final read uses the outer object.

## Initial validation cases

| Case | Expected behavior |
| --- | --- |
| Allocate, open, read, close | Finish with unit and a Closed object |
| Allocate, read | Protocol error in Closed |
| Allocate, open, close through alias, read | Protocol error in Closed |
| Allocate two objects, open only the first, read the second | Protocol error on the second object |
| True guard with a safe branch and an invalid unselected branch | Execute only the safe branch |
| Forbidden operation inside an active let binding | Terminate with a protocol error |
| Method receiver closes an alias before returning the object | A subsequent read fails in Closed |
| Guard opens an object and then returns true | Selected branch observes the Open state |
| Shadow an outer variable with a second allocation, then use the outer variable | Outer identity is restored; heap effects on both objects persist |
| Boolean receiver, unit guard, or unknown method name | Rejected by base typing |
| Safe termination with an Open object | Allowed; cleanup is not a safety requirement |

Analyzer regression obligations additionally include joins returning different identities, branch-local allocations, and weak updates that retain old states for unselected targets. These are expected checks for the future implementation, not reported test results.

These cases specify expected behavior for the proposed semantics. They do not establish soundness of a static analyzer.
