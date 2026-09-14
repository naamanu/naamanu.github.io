---
layout: post
title: "Functional Program Design in OCaml: Building a Task Tracker"
description: "Design a complete OCaml program around domain types, explicit state transitions, small module interfaces, and a testable core, using a task-tracker CLI."
date: 2026-09-12
published: false
author: "Nana Adjei Manu"
category: "engineering"
tags: ["OCaml", "Functional Programming", "Software Design"]
---

You know how to write a recursive function. You can pattern match on a variant in your sleep. Then you sit down to write an actual program, and the questions change.

Who owns the state? Where does input get validated? Which functions are allowed to know about the terminal? What does a caller get back when something can't succeed?

Those aren't OCaml questions. They're design questions, and they show up in every language. But OCaml gives you sharp tools for answering them: types that describe the domain, functions that describe change as values in and values out, and module signatures that draw a line around what callers can touch.

I want to show you how those tools fit together by building something small: a task tracker that runs in the terminal. It's simple enough to hold in your head and just big enough to force real decisions about state, errors, and boundaries. Along the way I'll show you the versions I'd write first, and why I'd throw them away.

This assumes you're comfortable with `let`, records, variants, and pattern matching. If not, start with the [beginner's guide to functional programming with OCaml](/blog/beginners-guide-to-functional-programming-with-ocaml/). The [complete source](/assets/examples/functional-program-design/task_tracker.ml) is a single file using only the standard library, with runnable assertions at the bottom. Every snippet below is lifted from it, except the ones I label as the version we're not keeping. I checked it with OCaml 5.5.

## Start with the behavior, not the types

I used to start these things by declaring types. It feels productive. It's also how you end up with a `task` record that has five fields you never use and none of the ones you need.

So let's start with what the program does. Four commands:

| Command | Behavior |
| --- | --- |
| `add <title>` | Create an open task and report its ID. |
| `done <id>` | Mark an existing task as done. |
| `list` | Show tasks in creation order. |
| `quit` | End the session. |

Tasks live only for the current session. That's deliberate. I want to talk about design without also designing a file format.

Now the rules. A title has to contain text after trimming whitespace. IDs start at one and never repeat within a session. Completing an unknown ID is an error. Completing a task that's already done succeeds and changes nothing. And a bad command must never throw away your existing tasks.

Notice that one of those rules is a real decision. Should a second `done 1` be an error, or a no-op? A type declaration can't answer that for you. I chose no-op because the command is asking for a state of the world, "task one is done," and that state already holds. Either answer is defensible. What matters is that you decide it here, in prose, before the type checker forces you to decide it by accident in some branch of a `match`.

## Give the domain a vocabulary

First, the ways things can go wrong:

```ocaml
type error =
  | Empty_title
  | Unknown_task of int
  | Invalid_command
  | Invalid_id
```

Errors as variants means the core can say `Unknown_task 12` without deciding how to phrase that for a human. The number stays attached. Whoever eventually prints it, logs it, or turns it into a 404 gets to decide the wording.

Parsing errors and domain errors share one type here. In a bigger program I'd split them. In a two-hundred-line one, the conversions between error types would be more code than the errors.

Next, titles. Here's the version I'd write first:

```ocaml
(* The version we're not keeping. *)
type task = { id : int; title : string; status : status }
```

It compiles. It also means every function that touches a task has to wonder whether `title` has been trimmed and checked yet. The rule "titles contain text" lives nowhere in particular, so it gets enforced everywhere, or nowhere.

Instead, give a valid title its own type:

```ocaml
module Title : sig
  type t
  val make : string -> (t, error) result
  val to_string : t -> string
end = struct
  type t = string

  let make text =
    let text = String.trim text in
    if text = "" then Error Empty_title else Ok text

  let to_string title = title
end
```

`Title.make` is a smart constructor: it checks the rule, and it's the only way to get a `Title.t`. Because the signature says `type t` and not `type t = string`, callers can't build one by hand. Any function that receives a `Title.t` can stop wondering.

That last point is the whole trick, and it's easy to get half right. Hide the type but skip the check, and you've protected nothing. Check the string but expose `type t = string`, and callers walk straight past the check. You need both.

Be honest about what the type promises, though. This one promises trimmed, non-empty text. Nothing about length, nothing about Unicode. A type is only useful when you can say exactly what it guarantees.

Now a task:

```ocaml
type status = Open | Done
type task = { id : int; title : Title.t; status : status }
```

Two statuses, exactly one at a time. No `is_open` and `is_done` booleans whose four combinations you have to explain in a comment.

These types don't guarantee unique IDs, though. Uniqueness is about how tasks enter a collection, so it belongs to whoever owns the collection.

## Make changes explicit

Here's my first instinct for handing out IDs. I'm showing it because I've seen it in production code more than once:

```ocaml
(* The version we're not keeping. *)
let next_id = ref 1

let fresh_id () =
  let id = !next_id in
  incr next_id;
  id
```

It works. Then you write two tests, each expecting its first task to have ID 1, and one of them fails depending on which order the runner picks. You fix that by resetting the counter at the top of every test. Then someone writes a test that forgets. The problem isn't the `ref`. The problem is that the counter lives outside the state, so no value in the program can tell you what the next ID will be.

Put it in the state:

```ocaml
type t = { next_id : int; tasks : task list }

let empty = { next_id = 1; tasks = [] }
let tasks state = List.rev state.tasks
```

Tasks are stored newest first, so adding is a prepend. The public `tasks` function reverses into creation order, and callers never learn how they're stored.

Adding takes the current state and returns a new state plus the task it created:

```ocaml
let add text state =
  Result.bind (Title.make text) (fun title ->
    let task = { id = state.next_id; title; status = Open } in
    let next = { next_id = state.next_id + 1; tasks = task :: state.tasks } in
    Ok (next, task))
```

The state owns the ID supply. A failed validation produces no new state and burns no ID. And calling `add` twice with the same inputs gives the same answer, same ID included, which is exactly what makes it easy to test. That same property tells you the limit: these IDs are unique within one chain of states, not across independent sessions. A service with concurrent writers needs a different scheme.

Completion follows the same pattern:

```ocaml
let complete id state =
  match List.find_opt (fun task -> task.id = id) state.tasks with
  | None -> Error (Unknown_task id)
  | Some { status = Done; _ } -> Ok state
  | Some _ ->
      let tasks = List.map (fun task ->
        if task.id = id then { task with status = Done } else task
      ) state.tasks in
      Ok { state with tasks }
```

Three cases, matching the three rules from earlier. And the old state is still there. If a test holds `state` and gets back `next`, it can compare them directly. There's no mutation to undo.

**That's what explicit state buys you.** The input says what the operation knows. The output says what it proposes. The caller decides whether to go along with it.

## Parse once, then work with values

Terminal input is text. I don't want every domain function re-reading that text. So the parser turns a line into a command, once:

```ocaml
type command = Add of string | Complete of int | List | Quit
```

Here's where I'd make another mistake, if I hadn't already made it before. It's tempting to validate the title inside the parser, since that's where the string arrives. Then someone calls `Tracker.add` directly, from a test or a second interface, and the check isn't there. Validation belongs with the rule, so `Tracker.add` keeps it. The parser only recognizes syntax. That means `add` with no title parses fine as `Add ""`, and it's the execution step that comes back with `Empty_title`. That's the right split.

The parser itself:

```ocaml
let split_command line =
  let line = String.trim line in
  match String.index_opt line ' ' with
  | None -> (line, "")
  | Some index ->
      let verb = String.sub line 0 index in
      let argument =
        String.sub line (index + 1) (String.length line - index - 1)
        |> String.trim
      in
      (verb, argument)

let parse line =
  match split_command line with
  | "add", title -> Ok (Add title)
  | "done", text ->
      let decimal =
        text <> "" && String.for_all (fun c -> c >= '0' && c <= '9') text
      in
      if not decimal then Error Invalid_id
      else (
        match int_of_string_opt text with
        | Some id when id > 0 -> Ok (Complete id)
        | _ -> Error Invalid_id)
  | "list", "" -> Ok List
  | "quit", "" -> Ok Quit
  | _ -> Error Invalid_command
```

The digit check in the `done` branch looks redundant next to `int_of_string_opt`. It isn't. OCaml's integer parser is generous: `int_of_string_opt "1_0"` is `Some 10`, `"0x10"` is `Some 16`, and `"+1"` is `Some 1`. None of those is a task ID anyone typed on purpose. The `for_all` check says what I actually mean, and `int_of_string_opt` handles the one thing `for_all` can't: a string of digits too long to fit in an `int`.

Execution maps commands onto the domain, and its result says whether to keep going:

```ocaml
type outcome = Continue of Tracker.t * string | Stop

let execute command state =
  match command with
  | Add title ->
      Result.map (fun (next, task) ->
        Continue (next, Printf.sprintf "Added task %d." task.Tracker.id)
      ) (Tracker.add title state)
  | Complete id ->
      Result.map (fun next ->
        Continue (next, Printf.sprintf "Task %d is done." id)
      ) (Tracker.complete id state)
  | List -> Ok (Continue (state, render_tasks state))
  | Quit -> Ok Stop
```

`render_tasks` builds a string and prints nothing, which is what makes it testable. `Continue` carries the next state and something to show. `Stop` carries neither. The shell doesn't have to check a boolean or guess that a particular message means "quit."

`Result.map` transforms a success and leaves an error alone. When the next step can also fail, use `Result.bind`:

```ocaml
let process_line line state =
  Result.bind (parse line) (fun command -> execute command state)
```

If parsing fails, execution never runs. A `match` would do the same thing in five lines; the combinator does it in one. The official [error-handling guide](https://ocaml.org/docs/error-handling) covers `result` alongside OCaml's other options.

Step back and look at who knows what. `Tracker` knows the rules. `execute` knows how this app responds to a command. `process_line` knows the order. Nothing reads input, splits text, allocates IDs, updates a list, and prints, all in one function.

## Draw the boundary on purpose

Here's the whole public face of the tracker:

```ocaml
module Tracker : sig
  type status = Open | Done
  type task = { id : int; title : Title.t; status : status }
  type t

  val empty : t
  val tasks : t -> task list
  val add : string -> t -> (t * task, error) result
  val complete : int -> t -> (t, error) result
end
```

Task records are visible because callers need to read them. The state is hidden because callers must not replace its counter or insert arbitrary tasks. You can construct a `Tracker.task` by hand, but there's no operation that takes one, so it can't get in.

That's more precise than reflexively hiding everything. The question is concrete: what must a caller be prevented from doing, and what must it be allowed to see? Answer that, and the signature writes itself.

I used an inline signature here. In a real project these would be separate `.mli` files, and you'd only reach for a functor if something genuinely needed to vary over another module. Neither is needed to show the boundary. The official [modules guide](https://ocaml.org/docs/modules) has the mechanics.

## Keep the terminal at the edge

The loop is left with almost nothing to do:

```ocaml
let rec loop state =
  print_string "> ";
  flush stdout;
  match read_line () with
  | exception End_of_file -> print_newline ()
  | line ->
      match process_line line state with
      | Error error ->
          print_endline (error_message error);
          loop state
      | Ok (Continue (next, message)) ->
          print_endline message;
          loop next
      | Ok Stop -> print_endline "Goodbye."
```

Look at the two recursive calls. On error, the loop continues with the state it already had. On success, it continues with the state it was handed. That's the "a bad command never loses your tasks" rule, and you can see it enforced in two lines instead of hunting for it across the program.

EOF is handled where input is read, and only there. The exception pattern is scoped to `read_line ()`, so it doesn't quietly turn some deeper failure into "end of input." Both `loop` calls are in tail position, so a long session doesn't grow the stack.

People call this a functional core with an imperative shell. Don't read that as "no side effects allowed." OCaml has mutation, loops, and exceptions, and they're fine. Reading and printing live in the shell because none of the domain decisions need them, not because they're forbidden.

One caveat worth keeping: nothing in the type of `process_line` proves it's pure. OCaml's types don't track effects. You know it's pure because you read it and everything it calls. Keeping that surface small is what makes the claim checkable.

## Run it and test it

Download the [complete source](/assets/examples/functional-program-design/task_tracker.ml), then compile and run it from wherever you saved it:

```sh
ocamlc -o task_tracker task_tracker.ml
./task_tracker
```

A session looks like this:

```text
Tasks last for this session. Commands: add <title>, done <id>, list, quit.
> add Write the article
Added task 1.
> done 1
Task 1 is done.
> list
1. [x] Write the article
> done 99
No task with ID 99.
> quit
Goodbye.
```

The same file has assertions behind `./task_tracker --test`. Here's the part that checks earlier states survive later operations:

```ocaml
let initial = Tracker.empty in
let first, task = unwrap (Tracker.add "  Write the article  " initial) in
let second, other = unwrap (Tracker.add "Check the examples" first) in
let completed = unwrap (Tracker.complete task.id second) in
```

`unwrap` is a helper that fails the test on an unexpected `Error`. Then:

```ocaml
assert (Tracker.tasks initial = []);
assert (Title.to_string task.title = "Write the article");
assert (task.id = 1 && other.id = 2);
assert (Tracker.tasks first = [task]);
assert (Tracker.tasks second = [task; other]);
```

The rest cover completion, repeated completion, unknown IDs, empty titles, every parser rejection, and rendered output. All of them go through the public interface. If I swapped the list for a map tomorrow, none of them would need to change, and that's the test of whether the boundary is in the right place.

These are examples, not proofs. With more behavior I'd reach for property-based tests: generate random command sequences and check that IDs stay unique and existing titles never change.

## Know what it costs

Immutable updates aren't free. Adding shares the old list's tail, which is cheap. Completing searches the list, then maps over it to build a new spine. Listing reverses and formats everything. For a session tracker that's fine, but completion and listing are linear in the number of tasks.

If that ever mattered, a map keyed by ID would be the next move, with something extra to preserve creation order. The abstract state type is what makes that a local change instead of a migration.

Keeping old states around also keeps their memory around. Immutability makes history possible, not free. This loop drops each state as soon as it has the next one. An undo feature would hold onto them on purpose.

And persistence is its own problem. A computed next state isn't a saved one. The shell would need a save policy and a story for when saving fails. Separating computation from I/O helps you see that problem clearly. It doesn't solve it.

So here's the order I'd follow the next time you start a program, in OCaml or anywhere else. Write down the rules first, in prose. Model the values those rules mention. Write the transitions as plain functions from state to state. Protect the invariants callers could otherwise break. Then, and only then, wire it to the outside world. Every boundary you draw should have a reason you can point to in the behavior of the program. If it doesn't, you don't need it yet.
