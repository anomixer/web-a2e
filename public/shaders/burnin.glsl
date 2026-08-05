precision highp float;

uniform sampler2D u_currentTexture;
uniform sampler2D u_previousTexture;

// Base time constant in seconds: how long the phosphor takes to fall to 1/e of
// its brightness. Driven by the Burn In slider.
uniform float u_burnInTau;

// Seconds since the previous accumulation pass. Decay is a function of elapsed
// time, not of frames: the pass is throttled to every fourth frame and the
// frame rate itself varies, so a per-frame decay made persistence depend on how
// busy the machine was.
uniform float u_deltaTime;

// 0 = colour, 1 = green, 2 = amber, 3 = white
uniform int u_monochromeMode;

varying vec2 v_texCoord;

void main() {
    // Flip Y when sampling current texture to match main rendering coords
    vec2 flippedCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
    vec3 current = texture2D(u_currentTexture, flippedCoord).rgb;
    vec3 previous = texture2D(u_previousTexture, v_texCoord).rgb;

    // Phosphor decays exponentially, not linearly. The old code subtracted a
    // constant each pass, which made every brightness take the same time to
    // reach black — so a dim trail vanished as slowly as a bright one, and the
    // decay had a hard edge where it clamped at zero. An exponential falls
    // quickly at first and then lingers, which is why a real trail has a long
    // faint tail rather than a visible end.
    vec3 tau;

    if (u_monochromeMode == 0) {
        // A colour tube's three phosphors do not decay together. Green persists
        // longest and blue fades quickest, which is why the trail behind moving
        // white text on a colour CRT tints green as it dies.
        tau = u_burnInTau * vec3(1.0, 1.6, 0.7);
    } else {
        // A monochrome tube has a single phosphor coating, so there is nothing
        // to tint: every channel decays at one rate. Long-persistence green and
        // amber tubes hold noticeably longer than a colour set, which is much
        // of what makes them feel different to look at.
        tau = vec3(u_burnInTau * 1.5);
    }

    // exp(-dt/tau) per channel. A large dt (a backgrounded tab) simply decays
    // to zero, which is what would really have happened.
    vec3 decayed = previous * exp(-u_deltaTime / max(tau, vec3(0.0001)));

    // Never darker than what is on screen now: the afterimage is something the
    // phosphor adds to the picture, never something it takes away.
    vec3 result = max(current, decayed);

    gl_FragColor = vec4(result, 1.0);
}
