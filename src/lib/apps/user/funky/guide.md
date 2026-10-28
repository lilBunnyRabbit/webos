## Writing code

Write on the left; the panel on the right (in a narrow window, switch with the menu at the end of the toolbar) shows the result as you type.

- `var name = …` is a setter: one shared value the game keeps.
- `output name = …` is the input of one part, like an aileron or a nozzle.
- `fn` defines a function that's written out wherever it's used, and `const` a fixed number.
- `//` starts a comment. Order doesn't matter: the setters come out in the order the game needs.

Start typing a name for suggestions; hover one to read what it does. **Examples** loads a ready-made craft logic, like an autopilot or gear doors, with a note on what it shows.

## The panels

- **Simulate:** pick a flight state, press **Play** or step one tick at a time, and watch the values on the graph. Change the world values by hand, add watches, or write a **Script** of timed steps like `2s Pitch = 1`. Record a run and export it as CSV. There's no flight model: the world only changes when you or the script change it.
- **Setters** and **Parts:** what to paste into the game. Copy one, copy them all, or copy a DebugExpression to watch a value live in the game's dev console. Click a name to find it in the code.
- **Problems:** errors and warnings. Click one to jump to the line. While something doesn't compile, the other panels show the last version that did.
- **Import:** open a SimplePlanes aircraft save (`.xml`) to list its setters and part inputs, then **Open as code** to turn them into Funky DSL.

## Files

Your code saves as `.fdsl` files: Ctrl+S saves, Ctrl+Shift+S saves under a new name, Ctrl+O opens a code file or a craft.
