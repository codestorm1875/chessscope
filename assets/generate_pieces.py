"""Render the twelve carved-wood chess sprites with Blender.

Run from the project root:
  blender -b -noaudio --python assets/generate_pieces.py
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "pieces"
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.resolution_x = 300
scene.render.resolution_y = 300
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'

def wood(name, low, high):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*high, 1)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.34
    bsdf.inputs['Coat Weight'].default_value = 0.18
    bsdf.inputs['Coat Roughness'].default_value = 0.25
    tex = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (13, 13, 1.8)
    links.new(tex.outputs['Generated'], mapping.inputs[0])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.3
    noise.inputs['Detail'].default_value = 3.5
    noise.inputs['Roughness'].default_value = .75
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .18
    ramp.color_ramp.elements[0].color = (*low, 1)
    ramp.color_ramp.elements[1].position = .82
    ramp.color_ramp.elements[1].color = (*high, 1)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .11
    bump.inputs['Distance'].default_value = .025
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat

maple = wood('Honey maple', (.56, .34, .17), (.91, .72, .44))
walnut = wood('Dark walnut', (.07, .028, .012), (.27, .11, .043))
gold = bpy.data.materials.new('Warm brass')
gold.diffuse_color = (.56, .35, .12, 1)
gold.use_nodes = True
gold.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.58, .37, .13, 1)
gold.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = .7
gold.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .29
eye = bpy.data.materials.new('Inset eye')
eye.diffuse_color = (.02, .013, .01, 1)

def finish(obj, material, bevel=.025):
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('Hand softened edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.affect = 'EDGES'
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

def lathe(name, profile, material):
    sides = 48
    vertices = [(r * math.cos(2*math.pi*i/sides), r * math.sin(2*math.pi*i/sides), z)
                for r,z in profile for i in range(sides)]
    faces = []
    for row in range(len(profile)-1):
        for i in range(sides):
            j=(i+1)%sides
            faces.append((row*sides+i,row*sides+j,(row+1)*sides+j,(row+1)*sides+i))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(profile)-1)*sides+i for i in range(sides)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, material, .013)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj

def ball(name, xyz, radius, material, scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=xyz)
    obj=bpy.context.object
    obj.name=name
    obj.scale=scale
    finish(obj,material,0)
    for face in obj.data.polygons:
        face.use_smooth=True
    return obj

def box(name, xyz, scale, material, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj,material,bevel)

def horse_head(material):
    # A thick carved silhouette, with a forward muzzle, mane and inset eyes.
    outline=[(-.28,.82),(.28,.82),(.24,1.08),(.17,1.35),(.38,1.55),(.44,1.67),
             (.40,1.78),(.13,1.82),(.04,2.06),(-.08,2.23),(-.19,2.12),
             (-.15,1.91),(-.37,1.75),(-.29,1.47),(-.38,1.22)]
    depth=.30
    vertices=[(x,y,z) for y in (-depth/2,depth/2) for x,z in outline]
    n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new('Horse head mesh')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new('Carved horse head',mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj,material,.047)
    ball('near eye',(.04,-.165,1.82),.033,eye)
    ball('far eye',(.04,.165,1.82),.033,eye)
    for z in [1.20,1.34,1.48,1.62]:
        ball('carved mane',(-.32,0,z),.105,material,(.55,1.5,.5))

def build(kind, material):
    lathe('Turned plinth',[(.01,.04),(.48,.04),(.53,.10),(.53,.18),(.46,.22),(.45,.27),
                           (.38,.31),(.36,.37),(.34,.40)],material)
    lathe('Brass foot ring',[(.505,.14),(.525,.14),(.525,.16),(.505,.16)],gold)
    if kind=='P':
        lathe('Pawn stem',[(.31,.38),(.25,.52),(.20,.85),(.24,.99),(.27,1.04),(.27,1.12),(.19,1.16)],material)
        ball('Pawn crown',(0,0,1.35),.25,material)
    elif kind=='R':
        lathe('Rook tower',[(.34,.38),(.31,.49),(.29,1.35),(.37,1.44),(.39,1.52),(.39,1.65),(.34,1.69)],material)
        for i in range(6):
            a=2*math.pi*i/6
            obj=box('Battlement',(.30*math.cos(a),.30*math.sin(a),1.77),(.20,.20,.23),material,.017)
            obj.rotation_euler[2]=a
    elif kind=='N':
        lathe('Knight shoulder',[(.33,.38),(.29,.65),(.30,.91),(.27,1.00)],material)
        horse_head(material)
    elif kind=='B':
        lathe('Bishop body',[(.33,.38),(.22,.63),(.20,1.12),(.28,1.28),(.30,1.35),
                             (.23,1.41),(.26,1.49),(.30,1.63),(.24,1.89),(.14,2.07),(.04,2.13)],material)
        ball('Bishop finial',(0,0,2.19),.10,gold)
        # Shallow diagonal notch on the near face of the mitre.
        notch=box('Mitre carving',(.02,-.214,1.74),(.34,.018,.032),gold,.012)
        notch.rotation_euler[1]=-.65
    elif kind=='Q':
        lathe('Queen body',[(.33,.38),(.24,.65),(.19,1.28),(.29,1.45),(.36,1.54),
                            (.47,1.89),(.40,1.96),(.23,1.92)],material)
        for i in range(5):
            a=2*math.pi*i/5
            ball('Queen crown jewel',(.37*math.cos(a),.37*math.sin(a),2.02),.105,gold)
        ball('Queen pearl',(0,0,2.08),.15,material)
    elif kind=='K':
        lathe('King body',[(.33,.38),(.26,.67),(.23,1.32),(.33,1.48),(.36,1.58),
                           (.35,1.76),(.27,1.85),(.23,1.92)],material)
        box('King cross vertical',(0,0,2.13),(.15,.15,.48),material)
        box('King cross horizontal',(0,0,2.18),(.40,.15,.13),material)
        ball('King cross pin',(0,-.085,2.18),.068,gold)

world=bpy.data.worlds.new('Warm studio')
scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.25,.25,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
def area(name, location, power, size):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector((0,0,1.1))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Large softbox',(-3,-4,7),650,5)
area('Rim light',(3,2,5),420,3)
bpy.ops.object.camera_add(location=(3.0,-6.2,3.75))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.14))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=2.75
scene.camera=camera

for side,material in [('w',maple),('b',walnut)]:
    for kind in 'KQRBNP':
        for obj in list(bpy.data.objects):
            if obj.type=='MESH': bpy.data.objects.remove(obj,do_unlink=True)
        build(kind,material)
        scene.render.filepath=str(OUT/f'{side}{kind}.png')
        print('Rendering',scene.render.filepath,flush=True)
        bpy.ops.render.render(write_still=True)

print('Finished twelve wooden piece sprites.',flush=True)
