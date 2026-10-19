# Pulsar Liquid Glass

The **Liquid Glass** GNOME Shell extension as shipped in **Pulsar OS**: the
translucent, refractive "liquid glass" effect (blur, tint, specular highlights,
edge lighting) applied to the top bar and its menus, Quick Settings,
notifications, OSDs, the dock and selected application windows.

## Provenance and licence

This is a redistribution of
[ryohsuke1231/liquid-glass](https://github.com/ryohsuke1231/liquid-glass) by
Ryosuke Watanabe, **licensed under the MIT License** — see [`LICENSE`](LICENSE).
The original project is the work of its author; Pulsar OS builds on it and
thanks them for releasing it.

The UUID is deliberately left unchanged (`liquid-glass@thinkingcoding1231.gmail.com`)
so that this build stays compatible with the upstream extension and with
users' existing settings.

## What Pulsar OS changes

The only Pulsar-specific code is the **dock glass profile**: the dock is a wide,
short surface, so applying the shared glass profile to it makes the edge lens
collapse into a thin rim. The dock therefore gets its own profile, read from the
`dock-glass-*` keys of the schema:

| Purpose | Key | Uniform in the shader |
| --- | --- | --- |
| Enable the effect on the dock | `enable-dock-glass` | — |
| Edge profile exponent (dock override) | `dock-glass-shape-n` | `profile_shape_n` |
| Peak refraction height (dock override) | `dock-glass-max-z` | `max_z` |
| Displacement scale (dock override) | `dock-glass-displacement` | `displacement_scale` |
| IOR (dock override) | `dock-glass-ior` | — |
| Corner radius, tint, expand | `dock-corner-radius`, `dock-tint-color`, `dock-glass-expand` | — |

A value of `0` means "inherit the shared profile". The implementation lives in
`dist/dockManager.js` (`_applyDockGlassProfile`, `_bindDockGlassProfile`,
`_applyMagnifyOverflow`).

> **Note on `src/` vs `dist/`:** `src/` is the TypeScript source and `dist/` is
> the compiled JavaScript that GNOME Shell actually loads. The Pulsar dock
> profile is currently applied **directly in `dist/dockManager.js`** and is not
> yet ported back into `src/`, so recompiling from `src/` alone will drop it.
> `src/` here is also an older snapshot of upstream than the running
> `dist/`.

## Installation

```sh
git clone https://github.com/Agnell02010/Pulsar-Liquid-Glass.git
cd Pulsar-Liquid-Glass
./install.sh
```

`install.sh` copies the extension into
`~/.local/share/gnome-shell/extensions/liquid-glass@thinkingcoding1231.gmail.com`,
compiles the GSettings schema and enables it. It reads the UUID from
`metadata.json`, so it is safe to re-run and does not depend on the folder's
name.

Manual install, if you prefer:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions/liquid-glass@thinkingcoding1231.gmail.com
cp -r . ~/.local/share/gnome-shell/extensions/liquid-glass@thinkingcoding1231.gmail.com/
gnome-extensions enable liquid-glass@thinkingcoding1231.gmail.com
```

On Wayland, log out and back in after installing or replacing the extension.

## Rebuilding from source

```sh
npm install
npm run build      # tsc -> dist/
npm run pack       # builds and produces the extension bundle
```

## Settings

The Pulsar OS dock profile values currently in use are applied through
`gsettings` rather than being baked into the schema defaults, so a
`gsettings reset` will revert them to the shared profile.
