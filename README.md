# cterm

Run the terminal from your `$HOME/Work` directory.

cterm is a private web terminal for your Tailscale network that opens a persistent shell. Install Bun and tmux, then run `bun install` and `bun cterm serve` and open `http://127.0.0.1:3001`. To access it from your tailnet, run `bun cterm service install` and `bun cterm tailscale install`.

Voice input uses the local [stt service](https://github.com/laroccacharly/stt). Install stt and run `stt service install`; select its provider with `stt provider set`. cterm connects to `http://127.0.0.1:4318` by default; set `CTERM_STT_URL` to use another address. The OpenRouter key configured in cterm is still used for voice-command selection.

# Demo

[![cterm demo](https://img.youtube.com/vi/vQedcqgL9Zg/maxresdefault.jpg)](https://youtu.be/vQedcqgL9Zg)
