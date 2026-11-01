// The macOS 27 opening: as a menu opens, a drop of glass leaves its button,
// slides from it with a flick, stretches in its run and blooms into the
// panel's shape with a jelly overshoot that settles humming ("rimbombo"); the
// panel's items come in only when the glass is almost round and still.
// Closing runs the same film backwards: the glass gathers into the drop and
// rises into the button, fading there.
//
// Written for PulsarOS. The motion is one physics model, not an ease: springs
// for the travel, springs for the two sizes, and a stretch taken from the
// speed of the travel, so the body always leans into the direction it runs.
import { Spring } from './spring.js';

export class DropMorphMotion {
    // The travel: a flick that arrives right away, with a small recentering.
    static CENTER_OPEN = { stiffness: 170, damping: 17, mass: 1.0 };
    // The bloom: soft enough to overshoot the panel a few units and oscillate
    // as it settles, which is the hum.
    static SIZE_OPEN = { stiffness: 125, damping: 16, mass: 1.0 };
    // Closing pulls the panel back a touch more gently: the glass gathers
    // into the drop and rises into the button, still humming a little.
    static CENTER_CLOSE = { stiffness: 150, damping: 20, mass: 1.0 };
    static SIZE_CLOSE = { stiffness: 150, damping: 13.5, mass: 1.0 };
    // The drop is thrown from where it was born: initial velocity, in shares
    // of the distance to cover per second.
    static THROW_OPEN = 9.5;
    static THROW_CLOSE = 2.2;
    // A stretch grows with the speed of the travel and relaxes with it.
    static SPEED_AT_MAX = 2400; // px/s of travel that reach the maximum
    static STRETCH_MAX = 0.45;
    // The size springs wake after the drop has left the button, so it blooms
    // while it is already on its way.
    static BLOOM_DELAY = 0.045;
    // The panel's items come in when the glass has almost stopped: a beat
    // after the fall, then in fast, on macOS's clock whatever the panel's
    // size is.
    static CONTENT_AT = 0.26;
    static CONTENT_S = 0.26;
    // Closing: the items leave at once, then the glass gathers and goes back.
    static CONTENT_OUT_S = 0.12;
    static ARRIVE_PAD = 1.25; // within this many button heights the drop is home
    static ARRIVE_MAX_S = 0.45;
    static GLASS_IN_S = 0.05; // the glass is there almost at once
    static GLASS_OUT_S = 0.13;

    constructor(opening, buttonRect, menuRect, menuRadius, state = null, opts = null) {
        this.opening = opening;
        this._button = [...buttonRect];
        this._menu = [...menuRect];
        this._menuRadius = menuRadius;
        this._t = 0;
        this._arrivedAt = -1;
        this._stoppedW = false;
        this._stoppedH = false;
        // pace: >1 runs the whole motion a touch slower; jiggle: >1 softens
        // the springs' damping so the overshoot bounces further and jiggles
        // more before it hums itself still.
        this._pace = Math.max(opts?.pace ?? 1, 0.05);
        const jig = Math.max(opts?.jiggle ?? 1, 0.05);

        const params = opening ? DropMorphMotion.CENTER_OPEN : DropMorphMotion.CENTER_CLOSE;
        const size = opening ? DropMorphMotion.SIZE_OPEN : DropMorphMotion.SIZE_CLOSE;
        const throwK = opening ? DropMorphMotion.THROW_OPEN : DropMorphMotion.THROW_CLOSE;
        const soft = p => ({stiffness: p.stiffness, damping: p.damping / jig, mass: p.mass});

        const softSize = soft(size);
        const drop = this._drop();
        this._szFrom = opening ? [drop, drop] : [...this._menu].slice(2, 4);
        this._cx = new Spring(params.stiffness, params.damping, params.mass);
        this._cy = new Spring(params.stiffness, params.damping, params.mass);
        this._w = new Spring(softSize.stiffness, softSize.damping, size.mass);
        this._h = new Spring(softSize.stiffness, softSize.damping, size.mass);
        // Reversing a half-way motion continues from where it is, at its speed.
        if (state && state.body) {
            const from = _center(state.body);
            [this._cx.value, this._cy.value] = from;
            [this._w.value, this._h.value] = [state.body[2], state.body[3]];
            if (state.vel) {
                this._cx.velocity = state.vel[0];
                this._cy.velocity = state.vel[1];
            }
            this._contentFrom = Number.isFinite(state.content) ? state.content : (opening ? 0 : 1);
        }
        else {
            const from = _center(opening ? this._button : this._menu);
            [this._cx.value, this._cy.value] = from;
            this._contentFrom = opening ? 0 : 1;
            this._szFrom = [state?.sz?.[0] ?? (opening ? drop : this._menu[2]),
                state?.sz?.[1] ?? (opening ? drop : this._menu[3])];
            [this._w.value, this._h.value] = this._szFrom;
        }
        [this._cx.target, this._cy.target] = _center(opening ? this._menu : this._button);
        this._cx.velocity = state?.vel ? this._cx.velocity : (this._cx.target - this._cx.value) * throwK;
        this._cy.velocity = state?.vel ? this._cy.velocity : (this._cy.target - this._cy.value) * throwK;
        [this._w.target, this._h.target] = opening
            ? [this._menu[2], this._menu[3]]
            : [drop, drop];
    }

    retarget(buttonRect, menuRect, menuRadius) {
        this._button = [...buttonRect];
        if (menuRect)
            this._menu = [...menuRect];
        this._menuRadius = menuRadius;
        const drop = this._drop();
        const to = _center(this.opening ? this._menu : this._button);
        [this._cx.target, this._cy.target] = to;
        if (this.opening) {
            [this._w.target, this._h.target] = [this._menu[2], this._menu[3]];
        }
        else {
            [this._w.target, this._h.target] = [drop, drop];
        }
    }

    step(elapsedS) {
        // The pace folds into the time itself, so an opening run a touch
        // slower stretches every beat of the motion, thresholds included.
        const dt = Math.min(Math.max(elapsedS / this._pace, 0), 0.05);
        this._t += dt;
        return this.opening ? this._open(dt) : this._close(dt);
    }

    get done() {
        if (this.opening) {
            return this._still(this._cx) && this._still(this._cy) && this._stoppedW && this._stoppedH;
        }
        return this._arrivedAt >= 0 &&
            (this._t - this._arrivedAt) >= DropMorphMotion.GLASS_OUT_S + 0.02;
    }

    // The body's speed, for a motion that reverses this one.
    get velocities() {
        return [this._cx.velocity, this._cy.velocity];
    }

    _drop() {
        const [, , w, h] = this._button;
        return Math.max(Math.min(h * 1.05, w), 1);
    }

    _still(s) {
        return Math.abs(s.value - s.target) < 1.5 && Math.abs(s.velocity) < 10.0;
    }

    _stretch() {
        const speed = Math.hypot(this._cx.velocity, this._cy.velocity);
        return Math.min(speed / DropMorphMotion.SPEED_AT_MAX, 1) * DropMorphMotion.STRETCH_MAX;
    }

    _open(dt) {
        const t = this._t;
        // Springs in one go; the size ones wake after BLOOM_DELAY.
        this._cx.update(dt * 1000);
        this._cy.update(dt * 1000);
        if (t >= DropMorphMotion.BLOOM_DELAY) {
            if (!this._stoppedW)
                this._stoppedW = this._w.update(dt * 1000) || this._still(this._w);
            if (!this._stoppedH)
                this._stoppedH = this._h.update(dt * 1000) || this._still(this._h);
        }

        const drop = this._drop();
        let w = this._w.value, h = this._h.value;
        // From the birth size, if the springs have not woken yet.
        if (t < DropMorphMotion.BLOOM_DELAY) {
            w = _lerp(drop, w, clamp01(t / DropMorphMotion.BLOOM_DELAY));
            h = _lerp(drop, h, clamp01(t / DropMorphMotion.BLOOM_DELAY));
        }
        // Stretch along the run: longer in the direction it travels, a little
        // thinner across, the way a drop of water leans into its fall.
        const e = this._stretch();
        if (e > 0.001) {
            if (Math.abs(this._cy.velocity) >= Math.abs(this._cx.velocity)) {
                h *= 1 + e;
                w /= Math.sqrt(1 + e);
            }
            else {
                w *= 1 + e;
                h /= Math.sqrt(1 + e);
            }
        }
        const w2 = Math.max(w, 1), h2 = Math.max(h, 1);

        // The corners round off into the panel's as the shape arrives.
        const span = Math.max(this._menu[2] - drop, 1);
        const grow = clamp01((w2 - drop) / span);
        const circle = Math.min(w2, h2) / 2;
        const radius = Math.min(_lerp(circle, this._menuRadius, easeOut(grow)), circle);

        // The items come in on a beat of their own: a little smaller than
        // their rest and catching up while the glass hums itself still.
        const p = easeOut(clamp01((t - DropMorphMotion.CONTENT_AT) / DropMorphMotion.CONTENT_S));
        const [cx, cy] = [this._cx.value, this._cy.value];
        this._lastFrame = {
            body: [cx - w2 / 2, cy - h2 / 2, w2, h2],
            bodyRadius: radius,
            contentScale: 0.96 + 0.04 * p,
            contentOpacity: _lerp(this._contentFrom, p, clamp01(t / 0.12)),
            lens: 1 - p,
            glassOpacity: clamp01(t / DropMorphMotion.GLASS_IN_S),
            soften: 0,
            done: false,
        };
        return this._lastFrame;
    }

    _close(dt) {
        const t = this._t;
        this._cx.update(dt * 1000);
        this._cy.update(dt * 1000);
        this._w.update(dt * 1000);
        this._h.update(dt * 1000);

        const drop = this._drop();
        let w = Math.max(this._w.value, 1), h = Math.max(this._h.value, 1);
        const e = this._stretch();
        if (e > 0.001) {
            if (Math.abs(this._cy.velocity) >= Math.abs(this._cx.velocity)) {
                h *= 1 + e;
                w /= Math.sqrt(1 + e);
            }
            else {
                w *= 1 + e;
                h /= Math.sqrt(1 + e);
            }
        }
        const span = Math.max(this._menu[2] - drop, 1);
        const grow = clamp01(Math.max(0.001, (Math.max(w, h) - drop) / span));
        const circle = Math.min(w, h) / 2;
        let radius = Math.min(_lerp(circle, this._menuRadius, easeOut(grow)), circle);

        let [bx, by, bw, bh] = this._button;
        const near = _gap(this._cx.value, this._cy.value, bx + bw / 2, by + bh / 2)
            <= bh * DropMorphMotion.ARRIVE_PAD;
        // Home when close AND slow: a fast drop mid-flight passes through the
        // button's neighbourhood without being there yet.
        const home = near && Math.hypot(this._cx.velocity, this._cy.velocity) < 500;
        if (this._arrivedAt < 0 && (home || t >= DropMorphMotion.ARRIVE_MAX_S))
            this._arrivedAt = t;

        let glassOpacity = 1;
        if (this._arrivedAt >= 0) {
            // Into the button's pill, wherever the springs are, and away.
            const c = easeInOut(clamp01((t - this._arrivedAt) / DropMorphMotion.GLASS_OUT_S));
            w = _lerp(w, bw, c);
            h = _lerp(h, bh, c);
            const cx = _lerp(this._cx.value, bx + bw / 2, c);
            const cy = _lerp(this._cy.value, by + bh / 2, c);
            [bx, by, bw, bh] = [cx - w / 2, cy - h / 2, Math.max(w, 1), Math.max(h, 1)];
            radius = Math.min(w, h) / 2;
            glassOpacity = 1 - easeInOut(clamp01((t - this._arrivedAt) / DropMorphMotion.GLASS_OUT_S));
            this._lastFrame = {
                body: [bx, by, bw, bh],
                bodyRadius: radius,
                contentScale: 1,
                contentOpacity: 0,
                lens: 0,
                glassOpacity,
                soften: 0,
                done: false,
            };
            return this._lastFrame;
        }
        // The panel's items leave while the glass is still the panel.
        const p = _lerp(this._contentFrom, 0, clamp01(t / DropMorphMotion.CONTENT_OUT_S));
        this._lastFrame = {
            body: [this._cx.value - w / 2, this._cy.value - h / 2, w, h],
            bodyRadius: radius,
            contentScale: 1,
            contentOpacity: p,
            lens: 0,
            glassOpacity: 1,
            soften: 0,
            done: false,
        };
        return this._lastFrame;
    }

    // The last frame this motion produced; a reversed one picks up from it.
    get frame() {
        return this._lastFrame ?? null;
    }

    // The undistorted size, as a share of the panel's own: [w, h]. Managers
    // that scale an actor with the motion (where the glass is the actor's own
    // look) use these, so the springs drive their scale exactly as they would
    // drive this glass.
    get scale() {
        return [this._w.value / Math.max(this._menu[2], 1), this._h.value / Math.max(this._menu[3], 1)];
    }

    // How stretched the body is right now, as a raw factor (0 to STRETCH_MAX):
    // the lean into the run, on top of the springs' own size.
    get stretch() {
        const speed = Math.hypot(this._cx.velocity, this._cy.velocity);
        return Math.min(speed / DropMorphMotion.SPEED_AT_MAX, 1) * DropMorphMotion.STRETCH_MAX;
    }

    // The axis the stretch leans on: 'y' the natural one, a sheet falling from
    // a pill above it, 'x' the rare sideways one.
    get axis() {
        return Math.abs(this._cy.velocity) >= Math.abs(this._cx.velocity) ? 'y' : 'x';
    }
}

// Where the drop is in its frame; the manager places glass and content with it.
export function frameDone(motion) {
    return motion.done;
}

function _center(rect) {
    return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
}

function _gap(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}

function _lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
