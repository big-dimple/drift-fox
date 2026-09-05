"""
make_gate.py — build the golden ice-crystal gate (冰晶门) and export GLB.

Run headless:  blender --background --python tools/blender/make_gate.py

Design source: the key art's floating golden ring. Material names are
semantic labels only — the game's prop loader maps them to the exact
PALETTE colors and the toon shader, so palette discipline lives in code.
Materials prefixed `energy_` are moved to the bloom layer by the loader.

Conventions: ring stands vertically, origin at the ground point directly
under the ring center, glTF +Y up.
"""
import math
import random
from pathlib import Path

import bpy

OUT = Path(__file__).resolve().parents[2] / "src" / "assets" / "models" / "gate.glb"

RING_RADIUS = 4.2
RING_TUBE = 0.65
RING_CENTER_Z = 5.2  # Blender Z-up; becomes glTF Y (height above ground)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name: str, rgb: tuple[float, float, float], metallic: float = 0.0,
                  emission: tuple[float, float, float] | None = None) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.5
    return mat


def shade_flat(obj: bpy.types.Object) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = False


def add_torus(name: str, major: float, minor: float, z: float,
              mat: bpy.types.Material, major_segments: int = 24, minor_segments: int = 6) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor,
        major_segments=major_segments, minor_segments=minor_segments,
        location=(0, 0, z),
    )
    obj = bpy.context.active_object
    obj.name = name
    # Torus spawns flat (XY plane); stand it up facing ±Y (Blender forward).
    obj.rotation_euler.x = math.radians(90)
    shade_flat(obj)
    obj.data.materials.append(mat)
    return obj


def add_box(name: str, scale: tuple[float, float, float], loc: tuple[float, float, float],
            mat: bpy.types.Material, rot_z: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler.z = rot_z
    bpy.ops.object.transform_apply(scale=True)
    shade_flat(obj)
    obj.data.materials.append(mat)
    return obj


def add_shard(name: str, radius: float, depth: float, loc: tuple[float, float, float],
              mat: bpy.types.Material, rng: random.Random) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=radius, radius2=radius * 0.15,
                                    depth=depth, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (rng.uniform(-0.9, 0.9), rng.uniform(-0.9, 0.9), rng.uniform(0, math.pi))
    shade_flat(obj)
    obj.data.materials.append(mat)
    return obj


def build() -> None:
    reset_scene()
    rng = random.Random(7)

    gold = make_material("gold", (0.85, 0.62, 0.20), metallic=0.35)
    gold_dark = make_material("gold_dark", (0.55, 0.38, 0.12), metallic=0.3)
    rune = make_material("energy_rune", (0.30, 0.85, 0.95), emission=(0.45, 0.95, 1.0))

    add_torus("gate_ring", RING_RADIUS, RING_TUBE, RING_CENTER_Z, gold)

    # Geometric notches around the outer rim — the key art's gear-like crown.
    for i in range(8):
        ang = i * math.pi / 4
        r = RING_RADIUS + RING_TUBE + 0.22
        add_box(
            f"gate_notch_{i}",
            (0.34, 0.5, 0.85),
            (math.cos(ang) * r, 0, RING_CENTER_Z + math.sin(ang) * r),
            gold_dark,
            rot_z=ang,
        )

    # Floating shards orbiting the ring.
    for i in range(9):
        ang = i * (2 * math.pi / 9) + rng.uniform(-0.15, 0.15)
        r = RING_RADIUS + 1.6 + rng.uniform(0, 0.9)
        add_shard(
            f"gate_shard_{i}",
            rng.uniform(0.16, 0.3),
            rng.uniform(0.7, 1.3),
            (math.cos(ang) * r, rng.uniform(-0.8, 0.8), RING_CENTER_Z + math.sin(ang) * r),
            gold,
            rng,
        )

    # Cyan rune band inlaid on the ring's front face (bloom layer in-game).
    add_torus("gate_rune", RING_RADIUS, 0.18, RING_CENTER_Z, rune,
              major_segments=24, minor_segments=4)

    # Two foot blocks so the gate can also read as standing on the snow.
    add_box("gate_foot_l", (0.9, 0.8, 0.6), (-(RING_RADIUS * 0.72), 0, 0.6), gold_dark)
    add_box("gate_foot_r", (0.9, 0.8, 0.6), (RING_RADIUS * 0.72, 0, 0.6), gold_dark)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )
    print(f"gate exported -> {OUT}")


if __name__ == "__main__":
    build()
