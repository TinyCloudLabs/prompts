# Rendered by runner.mjs terminal. Input is sent only to the recorder shell;
# Read-only attachment prevents input reaching the native client or its dialogs.
Require tmux
Output terminal.gif
Set Shell bash
Set Columns {{COLUMNS}}
Set Rows {{ROWS}}
Set FontSize 18
Set Framerate 5
Set TypingSpeed 0
Set WaitTimeout {{TIMEOUT}}s
Hide
Type "{{ATTACH}}"
Enter
Sleep 1s
Show
Wait+Screen /{{WAIT}}/
Screenshot terminal.png
Sleep 1s
