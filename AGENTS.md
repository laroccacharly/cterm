- use bun 
- use effect ts
- use oxlint 
- get inspired by ../memo for the stack 


# cterm 
cterm is a web terminal. 
so we can connect via tailscale to this app 
and it just shows a terminal from my $HOME/Work dir 
# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

# General

- Run `bun lint` after every code change.
- After any backend or frontend (UI) change, run `bun cterm service reinstall` — UI changes also need a service restart to be picked up.
- Run unfamiliar CLI commands with `--help` first.
- Use Playwright for end-to-end browser testing.
