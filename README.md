# cterm

Run the terminal from your `$HOME/Work` directory.

cterm is a private web terminal for your Tailscale network that opens a persistent shell. Install Bun and tmux, then run `bun install` and `bun cterm serve` and open `http://127.0.0.1:3001`. To access it from your tailnet, run `bun cterm service install` and `bun cterm tailscale install`.

# Future

Replace tmux with persistent PTYs owned by cterm, mirrored by a headless xterm on the server, so reattaching browsers receive the real scrollback and touch scrolling never waits on the network.

# Demo

[![cterm demo](https://img.youtube.com/vi/vQedcqgL9Zg/maxresdefault.jpg)](https://youtu.be/vQedcqgL9Zg)
