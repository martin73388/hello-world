LA ROUTE — Tech Demo · Implementation Brief

You are the sole engineer and technical artist on a real-time graphics tech demo. Build it end to end. This document is the spec, the art direction, and the acceptance criteria.

0. Prime directive

Visual quality is the product. There is no gameplay loop, no progression, no UI to design around. A player will load this, stand in a dim garage, watch the door roll up onto a sunlit forest, drive a camper van down a winding road for ninety seconds, stop in a clearing, walk around, light a campfire, and either think "this is AAA" or close the tab. Everything below serves that single judgment.

Two rules that override everything else in this document:

If a requirement in this brief conflicts with making the demo more beautiful, break the requirement. Note the deviation in DECISIONS.md with a one-line rationale. You have full authority to change scope, swap techniques, or drop a feature that isn't paying for its pixels.

Anything that reads as low-poly, flat-shaded, untextured, placeholder, or "indie prototype" is a defect, not a stepping stone. If you can't make a thing look finished, cut it from the frame rather than ship it looking rough.

Do not stop at "it works." Stop when every captured frame looks polished, cohesive, and production-ready.

1. Stack and hard constraints

Language	Modern JavaScript (ES2023 modules). JSDoc types encouraged, no TypeScript build step required.
Engine	Babylon.js latest stable, WebGPU only
Bundler	Vite
Target	Chrome stable on Windows 11, RTX 5070 Ti, 2560×1440
Frame target	90 FPS sustained. 60 FPS floor.
Frame time	No frame exceeding median + 4 ms after the loading screen dismisses

No fallbacks. No WebGL path, no mobile path, no feature detection branches. If navigator.gpu is absent, show a single line of text and stop. Do not spend a minute on compatibility.

Assets. Generate procedurally where it produces a better or more controllable result, including terrain, the road spline, noise, and most masks. Use free CC0 assets where hand-authored data wins, such as Poly Haven HDRIs and forest-floor, bark, moss, gravel, and asphalt PBR material scans, or ambientCG detail textures. Vendor everything into the repository; no runtime CDN fetches. Document every third-party asset and its licence in ASSETS.md.

2. Systems

2.1 Terrain and the road

A flat plane will kill this demo. The forest floor needs real form.

Build a geometry clipmap or nested-ring LOD centred on the player, so triangle density is high near the camera and falls off with distance. Aim for roughly sub-10 cm vertex spacing in the inner ring at default zoom.

Height comes from layered procedural noise composited on the GPU: broad valley walls and hillsides measured in tens of metres, medium hummocks, root mounds, and drainage gullies measured in metres, and fine leaf-litter undulation measured in decimetres. Do not use a single fBm octave stack and call it done. The terrain needs directional structure carved by water and wind: gullies run downslope, litter and fine forms stretch along the prevailing wind. Encode both directions and let the medium and fine layers shear along them.

The road is first-class geometry, not a texture. Define it as a hand-tuned spline and carve it into the heightfield with proper cut-and-fill embankments blended into the slopes. Give it a crowned profile, camber in the bends, worn wheel lines, gravel shoulders degrading into leaf litter, patch seams, and the occasional pothole. Plan the corridor like a camera dolly move: S-curves between trunks, one crest reveal, one tight hairpin, a ford or culvert over a gully, and a clearing at the end. Ninety seconds of driving must keep composing vistas on its own.

Include a small number of hero landmarks so there is silhouette and scale in the mid-distance: mossy granite boulders, one fallen trunk bridging a gully, a leaning wooden signpost. Keep them sparse. The brief is "the van, the road, and the forest," and these exist only to give the corridor something to say.

The far field needs ridgelines and heavy aerial perspective. A distant matte-projected ridge or a low-cost impostor ring is acceptable as long as it never reads as flat.

2.2 Vegetation and forest shading

This system is the most important code in the project. Budget accordingly.

Build custom materials using Babylon ShaderMaterial, a PBRCustomMaterial plugin, or an equivalent approach. Use WGSL through NodeMaterial or raw shader code, not a stock PBR material with a green albedo.

Trees are instanced from three or four archetypes (for example pine, birch, oak) with a trunk / branch / leaf-card hierarchy and a LOD chain ending in octahedral impostors. Density must read as forest interior, never as orchard rows. Ferns, grass tufts, and saplings fill the understorey.

Required behaviours:

Hierarchical wind. Trunks sway slowly, branches flex at mid frequency, leaves flutter at high frequency, all sheared along the prevailing wind. Gusts travel as visible waves across the canopy and through the understorey. Nothing in frame may be static.

Leaf translucency. Sunlight through foliage is the soul of a forest render. Use wrapped diffuse plus a back-transmission term with a thickness/vein map so backlit leaves glow yellow-green. This single term does more for "reads as forest" than almost anything else.

Dappled light. Canopy shadows must be soft but structured (PCSS-style), so the ground and the van receive moving coins of light. A slow gobo/cloud layer modulates intensity over distance.

Multi-scale ground detail. Leaf-litter normal maps at three tiling scales, blended by distance and slope, with triplanar mapping on steep cuts and embankments, and moss accumulation on north faces and upward root surfaces.

Dirt, mud, wet asphalt, and standing water as separate surface states. Read them from the terrain state buffer (§2.3) so they are shared by driving, walking, and weather. Each state gets its own albedo darkening, specular tightening, and scatter response.

View-dependent glinting. Dew and wet leaves sparkle at grazing angles only, with a stable hash so glints do not crawl under TAA. Keep it subtle. If it looks like glitter, halve it, then halve it again.

Contact detail. Rut edges need crumbly displaced granularity and micro-occlusion, not a clean bevel.

2.3 Terrain state and deformation

This is the core interactive system. Everything writes here; the ground shader reads it.

Maintain a vehicle-following render target covering roughly 120–160 m (the van moves faster than a walker), with resolution high enough for approximately 2–3 cm texels in the deformation area. A 4096² R16F target scrolled toroidally is a reasonable starting point. Snap movement to texel boundaries to avoid swimming.

Suggested channels, packed across one or two targets as appropriate:

Depression depth — how far tires and feet push the surface down.

Displaced mass — soil and gravel thrown outward, forming berms at rut edges. Do not skip this.

Compression, wetness, and scorch — persistent surface states used by shading.

Rules:

Deformation is persistent and additive, accumulated by writing brush splats into the target each frame. Never rebuild it from a list of past events.

Apply slow healing over time through gentle diffusion and decay: mud relaxes, puddles drain, dust settles. Tune it so a rut remains clearly visible after 60 seconds.

Terrain vertex displacement samples the depression and displaced-mass channels. Recompute normals from the same data so lighting and shadowing respond correctly. A rut that does not self-shadow is a failure.

Van tires, player feet, rain, and the campfire all write into this buffer. That shared write path is what makes every interaction feel embedded in the world rather than like an effect floating above it.

2.4 Atmosphere and lighting

Use a low, warm sun raking between the trunks, creating long shadows. Use cascaded shadow maps with PCSS-style soft filtering. Tune cascade splits so near-field rut and litter shadows stay crisp.

Use a high-quality HDRI or a physically based sky model if it gives better control over sun angle. Ambient light in shade must be strongly blue-shifted. The cool-shadow and warm-light contrast is essential to the forest rendering.

Add fog and aerial perspective with height falloff, and valley mist pooling in low ground. Distance should compress contrast noticeably.

Add airborne life: pollen and dust motes drifting through light shafts, and occasional falling leaves that land and persist on the ground, the road, and the van.

Add volumetric light shafts through the canopy where they materially improve the image. Keep them restrained.

Interactions emit light. Budget 4–6 dynamic lights maximum, with tight radii: two headlights, the campfire, a cabin light. Ensure the translucency and scatter terms respond, so the fire visibly glows through fern fronds and the headlights bloom in mist.

2.5 Post-processing

Order matters. Suggested chain:

TAA → SSAO → screen-space reflections on puddles and wet asphalt only → very restrained depth of field → restrained bloom → ACES or AgX tonemapping → subtle film grain → post-TAA sharpening.

TAA is essential for stabilising leaf cards, glinting, and thin geometry. Every post-process should be individually toggleable from the settings overlay for A/B comparison. Murky green mush and crushed-black canopy shadow are the primary failure modes for forest renders, so monitor midtone separation constantly and keep sky holes unclipped.

2.6 The camper van (and its driver)

The van will be seen from behind at mid-distance almost the entire time. It is the hero asset. Spend the budget on silhouette, materials, and motion; spend almost nothing on the driver's face.

Weathered two-tone paint with subtle clearcoat wear, GARAGE MODERNE lettering on the rear doors, panel gaps, softened dents, chrome trim, and glass with a visible cabin interior: dashboard, seats, and an air freshener hanging on a spring that must swing with every bump. Mud flaps, a roof rack with a strapped jerrycan, headlight and tail-light emissives behind refractive glass.

Suspension is per-wheel raycast with visible travel, body roll and pitch under weight transfer. Wheels steer and spin at the correct radius; they must never slide visually. An exhaust puff on start-up.

The driver is a mechanic in a worn jumpsuit, seen through the rear window and when on foot. Feet must plant rather than slide. Keep the cap low and the face in shadow rather than modelling features that cannot be finished to the same standard. Keep cloth simulation to collar and cuff secondary motion, and spend the freed budget on the van.

Entering and exiting uses an eased door animation and camera hand-off. A cut is acceptable only if fully masked by the ease.

2.7 Camera and controls

On foot: third-person, action-MMO framing, over the shoulder with a slight offset rather than directly behind. WASD movement relative to camera facing, mouse orbit, scroll-wheel zoom across a smooth eased range. Spring-arm camera, velocity-aware: it lags slightly under acceleration, widens FOV with speed, and tightens on stopping. All transitions ease, no snapping.

In the van: a chase camera slung low and slightly offset, banking gently with camber, lagging on throttle, pulling in on braking. An interior dashboard camera is optional and only if it can be finished to standard. E enters and exits the van.

Add subtle camera shake on potholes, hard landings, and heavy braking. Keep it subtle.

2.8 Interactions: keys 1–5

All five interactions share one grammar: continuous, momentum-carrying, unbroken flow. No instant spawns and no instant despawns. Everything eases in from the world and settles back into it. Every interaction reads and writes the terrain state buffer.

Suggested set, adjustable where a different implementation produces a stronger result:

Phares — Headlights fade up: volumetric cones through mist and dust, moths finding the beam, wet-road streaks, a warm glow spilling from the cabin.

Averse — A rain cell drifts overhead: the canopy intercepts first, then releases delayed drip cascades that continue after the rain stops. Surfaces darken, puddles grow in ruts and potholes and catch reflections, and thin mist rises afterwards.

Feu de camp — At a halt, a campfire eases from kindling glow to flame. Embers rise through the light shafts, smoke threads the canopy, warm light scatters through nearby foliage, and a scorch ring with trampled ground persists after the fire dies.

Heure dorée — A slow time-of-day glide between late afternoon and dusk: the sun sweeps down, mist forms in the hollows, and fireflies wake at the blue hour. Everything is continuous; nothing pops.

Klaxon — The horn scatters birds from the canopy (simple boids), shaking leaves loose that drift down and persist on the ground, the roof, and the windshield.

Implementation direction: use GPU compute particles for rain, drips, embers, leaves, and dust; simple flocking for birds; and a refraction pass where water needs translucency. Full screen-space fluid rendering is probably too expensive for the frame target, but use it if it remains within budget and materially improves the result.

Water and rain shading needs: refraction with restrained dispersion on puddles, depth-based absorption tint, animated flow-map normals where water runs in the wheel lines, foam flecks at the ford, and shed droplets with correct motion-blur streaking.

2.9 The drive

This will be used more than everything else combined. It receives the most polish.

Handling is weighty and analogue, tuned by hand until it feels good, not merely until it compiles: a torque curve you can feel, gentle slip on gravel, visible weight transfer in the hairpin, camber that rewards a carved line.

The wake is the centrepiece. On gravel and dirt, each wheel kicks spray and feeds a dust plume that hangs in the light shafts, drifts with the wind, and casts a shadow. On wet asphalt, twin water streaks and spray with motion-blur streaking. Off the road, tires carve deep persistent ruts with high berms. A completed detour should remain readable from across the clearing.

Entering and exiting speed uses eased transitions, never snaps. The FOV widens, wind streaks appear in screen space, the suspension chatters over washboard, the air freshener swings. There is no audio, so every visual cue must contribute to the sensation of speed.

2.10 The garage and the reveal

The first thing anyone sees, and the demo's thesis. Storyboard it, then build it.

The demo opens inside a dim garage rendered to the same standard as the forest: tungsten bulb under an enamel shade, workbench, tool wall, deep blue shadow. On first input, the sectional door rolls up panel by panel; daylight floods in; exposure adapts like an eye, eased and never snapping; the forest and the road appear framed by the doorway.

The garage remains enterable afterwards. Driving back in at dusk with the headlights on should compose a closing shot worth screenshotting.

3. Performance engineering

Garbage collection is your primary enemy. A 12 ms garbage-collection pause is a visible hitch and instantly destroys the AAA impression.

Zero allocations in the render loop. Do not use new inside per-frame code. Pre-allocate scratch Vector3, Matrix, and Quaternion instances at module scope and reuse them.

Do not use map, filter, reduce, spread syntax, or destructuring that creates new objects in hot paths. Use plain indexed for loops.

Do not construct strings each frame, including for the performance overlay. Update the overlay on a throttled interval and reuse buffers.

Use object pools for every transient effect, particle burst, and decal.

Use pre-allocated typed arrays for all GPU buffer uploads. Write into them rather than rebuilding them.

Use scene.freezeActiveMeshes(), mesh.freezeWorldMatrix(), material.freeze(), and scene.blockMaterialDirtyMechanism aggressively for static content.

Use thin instances for all repeated geometry: trees, ferns, grass, fallen leaves, roadside posts.

Profile with the Chrome performance panel and Babylon's inspector. Ship a frame-time graph in the overlay showing the 1% low, not merely an FPS counter. Average FPS will hide the exact hitching problem that matters most.

Set a frame budget and hold to it. At 90 FPS, the total budget is 11.1 ms. Allocate it explicitly across terrain, vegetation, shadows, deformation, vehicle, VFX, and post-processing. Record actual measured cost per system in PERF.md.

4. Loading and pipeline warm-up

WebGPU pipeline compilation stutter is a real and severe risk. A shader that first compiles when the player triggers the rain will produce a multi-hundred-millisecond freeze.

Before the loading screen dismisses:

Load and decode every texture, HDRI, mesh, and buffer.

Force-compile every material and particle-system pipeline, including every interaction, the impostors, every post-process, and every shader permutation, by rendering them once to a tiny offscreen target.

Warm every render target and run several frames of every compute pass.

Only then fade in.

A four-second load with a clean first minute is better than an instant load that hitches. Present a tasteful loading screen. This is the first thing anyone sees, so it must not resemble an unstyled browser default.

5. UI

Provide only a settings and performance overlay, toggled with a key such as F1 or backtick and hidden by default.

Contents:

Frame-time graph with 1% low.

Draw-call and triangle counts.

Individual toggles for every post-process and major system.

Quality presets.

Sliders for the art parameters most likely to need live tuning, including sun angle, fog and mist density, wind strength, wetness, rut depth, and healing rate.

Build this early. It will save hours.

No HUD. No crosshair. No prompts. Nothing else on screen, ever.

6. Project structure

Suggested structure; adapt as needed:

/src
/core engine bootstrap, render loop, resource manager, pooling
/terrain clipmap, procedural heightfield, road spline, deformation buffers
/vegetation tree archetypes, impostors, wind, understorey
/shaders WGSL
/vehicle van, suspension, wheels, cabin props
/character controller, locomotion, foot planting
/interactions one module per key + shared primitives
/vfx particle systems, decals, spray, dust
/post post-process chain
/ui settings overlay
/assets vendored, with ASSETS.md
DECISIONS.md every deviation from this brief + rationale
PERF.md measured frame budget per system

7. Milestones

Take a 1440p screenshot at every milestone, inspect it critically, and commit the screenshots.

Foundation — WebGPU boot, Vite, render loop, settings overlay with frame graph, camera, and WASD movement on a placeholder plane.

Forest, road, and atmosphere — Clipmap, procedural heightfield, carved road with embankments, instanced trees with hierarchical wind, leaf translucency, dappled cascaded shadows, sky IBL, and fog. Gate: a static screenshot with no character and no van already looks polished, atmospheric, and production-ready. Do not proceed until this is true.

Deformation — Full terrain state buffer, tire and footfall displacement with berms, healing, correct normals, and self-shadowing. Gate: ruts and footprints visibly displace mass, form raised edges, and integrate correctly with lighting.

Van and driver — Hero-asset van, suspension, enter/exit, locomotion, and foot planting.

The drive — The centrepiece. Spend disproportionate time here.

Interactions — All five, each writing into the world state.

The garage, the reveal, and the polish pass — Opening sequence, full post chain, tonemapping calibration, motes, and restrained light shafts.

Performance hardening — Profile, eliminate every allocation in the loop, verify 90 FPS with clean 1% lows, and verify that warm-up covers every pipeline.

8. Visual acceptance criteria

Before declaring the demo complete, verify each item against a fresh 1440p screenshot and in motion:

No visible faceting, hard polygon edges, or flat-shaded surfaces anywhere in frame.

Sky holes are not clipped to pure white; canopy shadows are blue, not grey, black, or green mush.

Distant ridgelines show clear aerial perspective and contrast compression.

Surface detail is legible at three distinct scales simultaneously: hillside, trunks, and litter grain.

Ruts have raised berms, self-shadow correctly, and soften over time.

Dew and wet-leaf glints appear only at grazing angles and do not crawl or shimmer in motion.

Trees move as a hierarchy — trunk, branch, leaf — with gusts travelling visibly across the canopy; nothing in frame is static.

Backlit foliage glows with translucency; fire and headlights visibly scatter through the leaves they touch.

The van reads as weathered metal and real glass, and the air freshener swings on every bump.

Rain wets what it touches, pools in the ruts, keeps dripping from the canopy after it stops, and every interaction leaves a mark that persists after the effect ends.

The dust plume behind the van reads as displaced mass with momentum, not merely particle spray.

The demo sustains 90 FPS with 1% lows above 60 FPS.

No hitch occurs on the first use of anything.

9. Working agreement

Build, don't test-loop. Playwright is available for capturing screenshots at milestones and catching hard regressions. Use it for those purposes. Do not build a test suite; time spent on tests is time not spent on the forest.

Look at your own output constantly. Capture screenshots, inspect them critically, and iterate on values. Most of the quality gap between "prototype" and "AAA" is parameter tuning, and you can only close it by looking.

Do not move on from an ugly milestone. Milestone 2 in particular is a hard gate.

When a technique is not working, replace it rather than patching it. You have full latitude over the approach.

Record every deviation in DECISIONS.md, briefly. One line is sufficient.

Ship something worth screenshotting.
