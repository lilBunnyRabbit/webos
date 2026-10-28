## What to try

- **Increment** and **Reset** change a counter that's saved and shared live by every Example window. Open two and watch them agree.
- **Run** starts about 20 seconds of pretend work in the background, with a progress toast you can cancel. It keeps going after you close the window. **Run, fail once** stops partway with an error so you can try **Retry**.
- **Show tasks** opens Activity Monitor at its Tasks list, where the run shows its steps and logs.
- The Window section shows whether the window is focused and its size, with Restore and Maximize. On a phone it has **Go home** instead.

## From the Terminal

- `example task` starts the same background work; add `--fail` (or `-f`) for the run that fails once.
- A link or launch can pass a starting number for the counter as the `count` prop; it's used only while nothing is saved yet.

## Reading the code

The whole app is in `src/lib/apps/user/example/`: the app definition, the window, the Terminal command and the task. Copy it to start your own.
