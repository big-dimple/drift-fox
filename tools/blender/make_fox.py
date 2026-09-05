"""
make_fox.py — build the SKINNED arctic fox and export GLB.

Run headless:  blender --background --python tools/blender/make_fox.py

Technique (stylized-game best practice, Blender-native):
  - Base skin: one continuous tube-built mesh (trunk, head, ears, four
    3-joint legs, feather-duster tail) with per-vertex hand weights.
  - TWO FUR SHELLS on top of it: the same geometry re-emitted, inflated
    along the analytic radial normals (+2.2cm, +5cm), sharing the same
    vertex weights so they follow the identical skeleton. The game shades
    them with an alpha-discard strand pattern (shell texturing) — the fuzzy
    two-layer fur read, without particle hair (off-contract: no hair sim).
  - Fur zigzag is baked into the base silhouette too: per-RING radius
    alternation (`spike`) + per-sector `jag`, fine-grained (many rings), so
    the edges ripple like fur instead of stacking like plates.

Skeleton (drivable from code via three.js getObjectByName):
  pelvis -> chest -> neck -> head
  pelvis -> tail_1 -> tail_2 -> tail_3
  chest  -> f{l,r}_shoulder -> f{l,r}_forearm -> f{l,r}_paw
  pelvis -> r{l,r}_thigh -> r{l,r}_shin -> r{l,r}_paw

Conventions: fox faces -Y in Blender (becomes glTF +Z = game heading 0),
origin at the ground point under the body center, glTF +Y up.
Materials are semantic labels only (fox_body / fox_shade / fox_dark /
fox_fur_1 / fox_fur_2); the game maps them to PALETTE colors + toon shader.
Shell objects carry custom props {noOutline, noInk} so the ink pipeline
leaves them alone.

Also renders turntable previews to shots/fox-turntable-*.png for art review.
"""
import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "assets" / "models" / "fox.glb"
SHOTS = ROOT / "shots"

V3 = tuple[float, float, float]

MAT_BODY = 0
MAT_SHADE = 1
MAT_DARK = 2

# Fur shell inflation offsets (m) and the ring ranges that carry fur per
# tube kind (paws / nose / eyes / ears stay fur-free so the dark points
# keep their crisp shape).
SHELLS = ((0.022, "fox_fur_1"), (0.038, "fox_fur_2"))


def v_add(a: V3, b: V3) -> V3: return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a: V3, b: V3) -> V3: return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_scale(a: V3, s: float) -> V3: return (a[0] * s, a[1] * s, a[2] * s)
def v_cross(a: V3, b: V3) -> V3:
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])
def v_norm(a: V3) -> V3:
    n = math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) or 1.0
    return (a[0] / n, a[1] / n, a[2] / n)


class Ring:
    """One cross-section of a tube: center, radii, bone weights, material.
    `jag` alternates the radius per sector (zigzag AROUND the tube);
    `spike` alternates the radius per RING (zigzag ALONG the tube) — fur
    tips cut the silhouette from every viewing angle."""
    __slots__ = ("c", "rx", "rz", "w", "mat", "jag", "spike")

    def __init__(self, c: V3, rx: float, rz: float,
                 w: list[tuple[str, float]], mat: int = MAT_BODY,
                 jag: float = 0.0, spike: float = 0.0):
        self.c = c
        self.rx = rx
        self.rz = rz
        self.w = w
        self.mat = mat
        self.jag = jag
        self.spike = spike


class Tube:
    """Bookkeeping for shell re-emission: where a tube's rings live."""
    __slots__ = ("base", "rings", "sides", "fur_from", "fur_to")

    def __init__(self, base: int, rings: int, sides: int,
                 fur_from: int, fur_to: int):
        self.base = base
        self.rings = rings
        self.sides = sides
        self.fur_from = fur_from
        self.fur_to = fur_to


class MeshBuilder:
    """Accumulates elliptical tubes into one mesh with per-vertex weights,
    analytic radial normals (for shell inflation), tube UVs and per-face
    material indices. Flat-shaded by construction."""

    def __init__(self) -> None:
        self.verts: list[V3] = []
        self.normals: list[V3] = []
        self.uvs: list[tuple[float, float]] = []
        self.weights: list[list[tuple[str, float]]] = []
        self.faces: list[tuple[int, ...]] = []
        self.face_mats: list[int] = []
        self.tubes: list[Tube] = []

    def add_tube(self, rings: list[Ring], sides: int, mat_fn=None,
                 cap_start: bool = True, cap_end: bool = True,
                 fur: tuple[int, int] | None = None) -> None:
        n = len(rings)
        base = len(self.verts)
        self.tubes.append(Tube(base, n, sides,
                               fur[0] if fur else 0,
                               fur[1] if fur else 0))
        for i, ring in enumerate(rings):
            prev_c = rings[max(0, i - 1)].c
            next_c = rings[min(n - 1, i + 1)].c
            t = v_norm(v_sub(next_c, prev_c))
            ref = (0.0, 0.0, 1.0) if abs(t[2]) < 0.9 else (1.0, 0.0, 0.0)
            s = v_norm(v_cross(ref, t))
            v = v_cross(t, s)
            # Ring-alternating fur zigzag along the tube.
            rmul = (1.0 + ring.spike) if i % 2 == 0 else (1.0 - ring.spike)
            for k in range(sides):
                a = 2.0 * math.pi * k / sides
                mul = (1.0 + ring.jag) if k % 2 == 0 else (1.0 - ring.jag)
                radial = v_norm(v_add(v_scale(s, math.cos(a)),
                                      v_scale(v, math.sin(a))))
                p = v_add(ring.c,
                          v_add(v_scale(s, math.cos(a) * ring.rx * mul * rmul),
                                v_scale(v, math.sin(a) * ring.rz * mul * rmul)))
                self.verts.append(p)
                self.normals.append(radial)
                self.uvs.append((k / sides, i / max(1, n - 1)))
                self.weights.append(ring.w)

        def ring_mat(i: int, k: int) -> int:
            if mat_fn is not None:
                return mat_fn(i, k, sides)
            # Section i spans rings i..i+1: take the FORWARD ring's material
            # so terminal rings (dark nose/paw tips, shade tail tip) show.
            return rings[min(i + 1, n - 1)].mat

        for i in range(n - 1):
            for k in range(sides):
                k2 = (k + 1) % sides
                r0 = base + i * sides
                r1 = base + (i + 1) * sides
                self.faces.append((r0 + k, r0 + k2, r1 + k2))
                self.face_mats.append(ring_mat(i, k))
                self.faces.append((r0 + k, r1 + k2, r1 + k))
                self.face_mats.append(ring_mat(i, k))
        if cap_start:
            ci = len(self.verts)
            self.verts.append(rings[0].c)
            self.normals.append(v_norm(v_sub(rings[0].c, rings[1].c)))
            self.uvs.append((0.5, 0.0))
            self.weights.append(rings[0].w)
            for k in range(sides):
                self.faces.append((ci, base + (k + 1) % sides, base + k))
                self.face_mats.append(ring_mat(0, k))
        if cap_end:
            ci = len(self.verts)
            self.verts.append(rings[-1].c)
            self.normals.append(v_norm(v_sub(rings[-1].c, rings[-2].c)))
            self.uvs.append((0.5, 1.0))
            self.weights.append(rings[-1].w)
            r = base + (n - 1) * sides
            for k in range(sides):
                self.faces.append((ci, r + k, r + (k + 1) % sides))
                self.face_mats.append(rings[-1].mat)


# ---------------------------------------------------------------------------
# Skeleton (Blender coords: fox faces -Y, Z up)
# ---------------------------------------------------------------------------

# name -> (head, tail, parent)
BONES: dict[str, tuple[V3, V3, str | None]] = {
    "pelvis": ((0, 0.30, 0.60), (0, 0.10, 0.62), None),
    "chest": ((0, 0.10, 0.62), (0, -0.20, 0.66), "pelvis"),
    "neck": ((0, -0.42, 0.72), (0, -0.58, 0.82), "chest"),
    "head": ((0, -0.58, 0.82), (0, -0.78, 0.90), "neck"),
    "tail_1": ((0, 0.42, 0.64), (0, 0.62, 0.70), "pelvis"),
    "tail_2": ((0, 0.62, 0.70), (0, 0.84, 0.74), "tail_1"),
    "tail_3": ((0, 0.84, 0.74), (0, 1.04, 0.70), "tail_2"),
}
for s, sx in (("l", 1.0), ("r", -1.0)):
    BONES[f"f{s}_shoulder"] = ((sx * 0.16, -0.26, 0.52), (sx * 0.16, -0.26, 0.30), "chest")
    BONES[f"f{s}_forearm"] = ((sx * 0.16, -0.26, 0.30), (sx * 0.16, -0.25, 0.12), f"f{s}_shoulder")
    BONES[f"f{s}_paw"] = ((sx * 0.16, -0.25, 0.12), (sx * 0.16, -0.28, 0.02), f"f{s}_forearm")
    BONES[f"r{s}_thigh"] = ((sx * 0.15, 0.32, 0.56), (sx * 0.16, 0.42, 0.34), "pelvis")
    BONES[f"r{s}_shin"] = ((sx * 0.16, 0.42, 0.34), (sx * 0.16, 0.34, 0.15), f"r{s}_thigh")
    BONES[f"r{s}_paw"] = ((sx * 0.16, 0.34, 0.15), (sx * 0.16, 0.40, 0.03), f"r{s}_shin")


def W(*pairs: tuple[str, float]) -> list[tuple[str, float]]:
    return list(pairs)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def belly_mat(i: int, k: int, sides: int) -> int:
    """Trunk: lower third of the circumference reads as shaded belly."""
    a = 2.0 * math.pi * (k + 0.5) / sides
    return MAT_SHADE if math.sin(a) < -0.35 else MAT_BODY


def build_mesh() -> MeshBuilder:
    mb = MeshBuilder()

    # Trunk: rump tip -> neck. Deep chest, low-slung; belly shading via
    # sector rule. Fur covers the whole trunk.
    mb.add_tube([
        Ring((0, 0.62, 0.64), 0.09, 0.12, W(("pelvis", 1.0))),
        Ring((0, 0.47, 0.62), 0.185, 0.225, W(("pelvis", 1.0))),
        Ring((0, 0.30, 0.60), 0.215, 0.255, W(("pelvis", 0.8), ("chest", 0.2))),
        Ring((0, 0.12, 0.60), 0.22, 0.265, W(("pelvis", 0.5), ("chest", 0.5)), spike=0.04),
        Ring((0, -0.06, 0.62), 0.215, 0.27, W(("pelvis", 0.25), ("chest", 0.75))),
        Ring((0, -0.22, 0.66), 0.21, 0.275, W(("chest", 1.0)), spike=0.04),
        Ring((0, -0.36, 0.72), 0.185, 0.235, W(("chest", 0.6), ("neck", 0.4))),
        Ring((0, -0.47, 0.77), 0.15, 0.18, W(("chest", 0.25), ("neck", 0.75)), jag=0.07),
        Ring((0, -0.55, 0.81), 0.12, 0.135, W(("neck", 1.0)), jag=0.06),
    ], sides=10, mat_fn=belly_mat, fur=(0, 9))

    # Head: back of skull -> nose tip, carried low in line with the back.
    # Last ring is the dark nose; fur stops before it.
    mb.add_tube([
        Ring((0, -0.58, 0.86), 0.12, 0.13, W(("neck", 0.4), ("head", 0.6))),
        Ring((0, -0.68, 0.90), 0.135, 0.128, W(("head", 1.0))),
        Ring((0, -0.78, 0.91), 0.11, 0.11, W(("head", 1.0))),
        Ring((0, -0.86, 0.89), 0.075, 0.075, W(("head", 1.0))),
        Ring((0, -0.96, 0.87), 0.062, 0.055, W(("head", 1.0))),
        Ring((0, -1.05, 0.86), 0.042, 0.038, W(("head", 1.0))),
        Ring((0, -1.12, 0.855), 0.022, 0.022, W(("head", 1.0)), MAT_DARK),
    ], sides=8, fur=(0, 7))

    # Cheek ruffs: spiky outward-down tufts at the jaw line.
    for sx in (1.0, -1.0):
        mb.add_tube([
            Ring((sx * 0.10, -0.72, 0.86), 0.06, 0.055, W(("head", 1.0)), jag=0.12),
            Ring((sx * 0.145, -0.76, 0.84), 0.045, 0.04, W(("head", 1.0)), jag=0.18),
            Ring((sx * 0.175, -0.79, 0.825), 0.01, 0.01, W(("head", 1.0))),
        ], sides=5, fur=(0, 3))

    # Ears: short, wide-based triangles, set wide and tilted outward,
    # dark tip. No fur (ears stay crisp).
    for sx in (1.0, -1.0):
        mb.add_tube([
            Ring((sx * 0.115, -0.62, 0.93), 0.078, 0.05, W(("head", 1.0))),
            Ring((sx * 0.165, -0.615, 1.0), 0.06, 0.038, W(("head", 1.0))),
            Ring((sx * 0.20, -0.61, 1.05), 0.008, 0.008, W(("head", 1.0)), MAT_DARK),
        ], sides=5)

    # Front legs: thick and short (fox, not deer); paw = dark tapered tube
    # end. Fur covers the upper leg, stops above the dark paw.
    for s, sx in (("l", 1.0), ("r", -1.0)):
        sh, fo, pa = f"f{s}_shoulder", f"f{s}_forearm", f"f{s}_paw"
        mb.add_tube([
            Ring((sx * 0.16, -0.26, 0.54), 0.075, 0.075, W((sh, 1.0))),
            Ring((sx * 0.165, -0.26, 0.42), 0.068, 0.068, W((sh, 1.0)), jag=0.06),
            Ring((sx * 0.165, -0.25, 0.30), 0.056, 0.056, W((sh, 0.4), (fo, 0.6))),
            Ring((sx * 0.165, -0.26, 0.19), 0.048, 0.048, W((fo, 1.0))),
            Ring((sx * 0.165, -0.27, 0.115), 0.043, 0.043, W((fo, 0.4), (pa, 0.6))),
            Ring((sx * 0.165, -0.29, 0.05), 0.055, 0.045, W((pa, 1.0)), MAT_DARK),
            Ring((sx * 0.165, -0.32, 0.015), 0.032, 0.024, W((pa, 1.0)), MAT_DARK),
        ], sides=6, fur=(0, 4))

    # Rear legs: muscular thigh, hock S-curve, dark tapered paw.
    for s, sx in (("l", 1.0), ("r", -1.0)):
        th, sn, pa = f"r{s}_thigh", f"r{s}_shin", f"r{s}_paw"
        mb.add_tube([
            Ring((sx * 0.15, 0.30, 0.60), 0.09, 0.105, W((th, 1.0))),
            Ring((sx * 0.16, 0.37, 0.47), 0.08, 0.085, W((th, 1.0)), jag=0.10),
            Ring((sx * 0.165, 0.42, 0.34), 0.06, 0.06, W((th, 0.5), (sn, 0.5))),
            Ring((sx * 0.165, 0.37, 0.22), 0.05, 0.05, W((sn, 1.0))),
            Ring((sx * 0.165, 0.34, 0.145), 0.044, 0.044, W((sn, 0.5), (pa, 0.5))),
            Ring((sx * 0.165, 0.37, 0.07), 0.052, 0.042, W((pa, 1.0)), MAT_DARK),
            Ring((sx * 0.165, 0.41, 0.015), 0.03, 0.024, W((pa, 1.0)), MAT_DARK),
        ], sides=6, fur=(0, 4))

    # Tail: the key art's feather-duster — thick base, bushy middle, slight
    # tuck, flared spiky tip; fine ring-alternation ripples the silhouette,
    # light shade toward the tip. Fully furred.
    mb.add_tube([
        Ring((0, 0.46, 0.64), 0.09, 0.09, W(("pelvis", 0.4), ("tail_1", 0.6))),
        Ring((0, 0.57, 0.69), 0.135, 0.14, W(("tail_1", 1.0)), spike=0.08),
        Ring((0, 0.70, 0.73), 0.17, 0.175, W(("tail_1", 0.7), ("tail_2", 0.3)), spike=0.08),
        Ring((0, 0.83, 0.755), 0.185, 0.19, W(("tail_1", 0.3), ("tail_2", 0.7)), spike=0.08),
        Ring((0, 0.96, 0.76), 0.175, 0.18, W(("tail_2", 1.0)), spike=0.08),
        Ring((0, 1.07, 0.735), 0.15, 0.15, W(("tail_2", 0.6), ("tail_3", 0.4)), MAT_SHADE, spike=0.08),
        Ring((0, 1.16, 0.69), 0.12, 0.12, W(("tail_3", 1.0)), MAT_SHADE, spike=0.08),
        Ring((0, 1.24, 0.63), 0.085, 0.085, W(("tail_3", 1.0)), MAT_SHADE, spike=0.08),
        Ring((0, 1.30, 0.57), 0.05, 0.05, W(("tail_3", 1.0)), MAT_SHADE),
        Ring((0, 1.34, 0.52), 0.018, 0.018, W(("tail_3", 1.0)), MAT_SHADE),
    ], sides=10, fur=(0, 10))

    # Eyes: small dark almonds ON the skull surface. No fur.
    for sx in (1.0, -1.0):
        mb.add_tube([
            Ring((sx * 0.104, -0.79, 0.93), 0.022, 0.015, W(("head", 1.0)), MAT_DARK),
            Ring((sx * 0.114, -0.815, 0.925), 0.009, 0.007, W(("head", 1.0)), MAT_DARK),
        ], sides=4, cap_start=False)

    # Chest bib / nape ruff: the fluffy throat the key art outlines, with a
    # spike fin that cuts the front silhouette. Fully furred.
    mb.add_tube([
        Ring((0, -0.44, 0.74), 0.15, 0.16, W(("chest", 0.5), ("neck", 0.5))),
        Ring((0, -0.52, 0.60), 0.12, 0.105, W(("chest", 0.6), ("neck", 0.4)), jag=0.16, spike=0.10),
        Ring((0, -0.56, 0.50), 0.02, 0.02, W(("chest", 1.0)), MAT_SHADE),
    ], sides=6, fur=(0, 3))

    return mb


def make_material(name: str, rgb: V3) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def to_blender_object(name: str, verts: list[V3], faces: list[tuple[int, ...]],
                      face_mats: list[int], mats: list[bpy.types.Material],
                      weights: list[list[tuple[str, float]]],
                      uvs: list[tuple[float, float]]) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for m in mats:
        mesh.materials.append(m)
    for poly, mi in zip(mesh.polygons, face_mats):
        poly.material_index = mi
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv_layer.data[li].uv = uvs[mesh.loops[li].vertex_index]

    groups: dict[str, bpy.types.VertexGroup] = {}
    for vi, ws in enumerate(weights):
        total = sum(w for _, w in ws) or 1.0
        for bone, w in ws:
            vg = groups.get(bone)
            if vg is None:
                vg = obj.vertex_groups.new(name=bone)
                groups[bone] = vg
            vg.add([vi], w / total, "REPLACE")
    return obj


def build_armature() -> bpy.types.Object:
    arm_data = bpy.data.armatures.new("fox_rig")
    arm = bpy.data.objects.new("fox_rig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    bones: dict[str, bpy.types.EditBone] = {}
    for name, (head, tail, parent) in BONES.items():
        eb = arm_data.edit_bones.new(name)
        eb.head = head
        eb.tail = tail
        bones[name] = eb
    for name, (_, _, parent) in BONES.items():
        if parent is not None:
            bones[name].parent = bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def build() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mb = build_mesh()

    body = make_material("fox_body", (0.97, 0.98, 1.0))
    shade = make_material("fox_shade", (0.85, 0.91, 0.97))
    dark = make_material("fox_dark", (0.17, 0.20, 0.27))
    fur1 = make_material("fox_fur_1", (0.95, 0.97, 1.0))
    fur2 = make_material("fox_fur_2", (0.82, 0.89, 0.96))

    arm = build_armature()

    def bind(obj: bpy.types.Object) -> None:
        obj.parent = arm
        mod = obj.modifiers.new("armature", "ARMATURE")
        mod.object = arm

    fox = to_blender_object("fox", mb.verts, mb.faces, mb.face_mats,
                            [body, shade, dark], mb.weights, mb.uvs)
    bind(fox)

    # Fur shells: same topology re-emitted per tube fur range, inflated
    # along the analytic radial normals, sharing vertex weights.
    for offset, mat_name in SHELLS:
        sverts: list[V3] = []
        sweights: list[list[tuple[str, float]]] = []
        suvs: list[tuple[float, float]] = []
        sfaces: list[tuple[int, ...]] = []
        sfacemats: list[int] = []
        for tube in mb.tubes:
            if tube.fur_to <= tube.fur_from:
                continue
            ring_base: list[int] = []
            for i in range(tube.fur_from, tube.fur_to):
                ring_base.append(len(sverts))
                for k in range(tube.sides):
                    vi = tube.base + i * tube.sides + k
                    sverts.append(v_add(mb.verts[vi],
                                        v_scale(mb.normals[vi], offset)))
                    sweights.append(mb.weights[vi])
                    suvs.append(mb.uvs[vi])
            n_rings = tube.fur_to - tube.fur_from
            for i in range(n_rings - 1):
                for k in range(tube.sides):
                    k2 = (k + 1) % tube.sides
                    r0 = ring_base[i]
                    r1 = ring_base[i + 1]
                    sfaces.append((r0 + k, r0 + k2, r1 + k2))
                    sfaces.append((r0 + k, r1 + k2, r1 + k))
                    sfacemats.extend((0, 0))
            # Cap both open ends — an open shell edge shows the dark interior
            # as a floating rim ring.
            for end_i, reverse in ((0, True), (n_rings - 1, False)):
                rb = ring_base[end_i]
                cx = sum(sverts[rb + k][0] for k in range(tube.sides)) / tube.sides
                cy = sum(sverts[rb + k][1] for k in range(tube.sides)) / tube.sides
                cz = sum(sverts[rb + k][2] for k in range(tube.sides)) / tube.sides
                ci = len(sverts)
                sverts.append((cx, cy, cz))
                sweights.append(mb.weights[tube.base + (tube.fur_from + end_i) * tube.sides])
                suvs.append((0.5, 0.5))
                for k in range(tube.sides):
                    k2 = (k + 1) % tube.sides
                    sfaces.append((ci, rb + k2, rb + k) if reverse else (ci, rb + k, rb + k2))
                    sfacemats.append(0)
        shell = to_blender_object(f"fur_shell_{mat_name}", sverts, sfaces,
                                  sfacemats, [bpy.data.materials[mat_name]],
                                  sweights, suvs)
        # The ink pipeline must leave the shells alone (no outline hull, no
        # normal/depth prepass) — the game's loader reads these props.
        shell["noOutline"] = True
        shell["noInk"] = True
        bind(shell)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB",
                              export_yup=True, export_apply=True,
                              export_extras=True)
    print(f"fox exported -> {OUT} ({len(fox.data.vertices)} base verts, "
          f"{len(BONES)} bones, {len(SHELLS)} fur shells)")


def turntable() -> None:
    """Rest-pose preview renders (Cycles CPU, low samples) for art review."""
    import mathutils

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    world = bpy.data.worlds.new("preview")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.82, 0.92, 1.0)
    scene.world = world

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 4))
    sun = bpy.context.active_object
    sun.rotation_euler = (math.radians(35), math.radians(-20), 0)
    sun.data.energy = 3.5

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.001))
    ground = bpy.context.active_object
    gmat = make_material("preview_ground", (0.55, 0.62, 0.72))
    ground.data.materials.append(gmat)

    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    scene.camera = cam

    def look_at(target: V3) -> None:
        d = mathutils.Vector(target) - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    views = {
        "front": (0.0, -2.4, 0.8),
        "side": (2.4, -0.2, 0.75),
        "back34": (-1.7, 1.9, 1.1),
    }
    SHOTS.mkdir(parents=True, exist_ok=True)
    for name, loc in views.items():
        cam.location = loc
        look_at((0, 0, 0.55))
        scene.render.filepath = str(SHOTS / f"fox-turntable-{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"turntable -> {scene.render.filepath}")


if __name__ == "__main__":
    build()
    try:
        turntable()
    except Exception as exc:
        print(f"turntable skipped: {exc}")
