import { pointerWithin, rectIntersection, MeasuringStrategy, type CollisionDetection, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { GripVertical, RotateCcw } from 'lucide-react';
import { DiagramWithZones } from '../../diagrams/Diagrams';
import type { DiagramSpec } from '../../lib/types';

const CHIP_COLORS = ['from-[#bfe3ff] to-[#8fc8ff]', 'from-[#e3ccff] to-[#c7a3ff]', 'from-[#c9ffd9] to-[#8ff0b0]', 'from-[#fff1b8] to-[#ffd96b]', 'from-[#ffd0e6] to-[#ff9fcb]', 'from-[#ccf7ff] to-[#8de9ff]'];
export const ZONE_FONT = 'clamp(9px, 3.1cqw, 40px)';

/** Drop where the finger/pointer is; fall back to overlap when the pointer is between targets. */
const fingerFirst: CollisionDetection = (args) => { const hits = pointerWithin(args); return hits.length ? hits : rectIntersection(args); };
const MEASURE = { droppable: { strategy: MeasuringStrategy.Always } };

function Chip({ id, text, color, small, selected, onTap }: { id: string; text: string; color: number; small?: boolean; selected?: boolean; onTap?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-item={id.replace(/^placed:/, '')}
      onClick={onTap}
      className={`game-title flex w-full touch-none select-none items-center justify-center gap-1 rounded-full bg-gradient-to-b ${CHIP_COLORS[color % CHIP_COLORS.length]} text-[#14135a] shadow-[0_0_0_2px_#fff,0_0_12px_rgba(56,225,255,0.6)] ${small ? 'h-full px-1 leading-none' : 'px-2 py-2.5 text-[clamp(13px,4.1vw,18px)]'} ${isDragging ? 'opacity-30' : ''} ${selected ? 'ring-4 ring-[#ffd23f]' : ''}`}
      style={small ? { fontSize: ZONE_FONT } : undefined}
    >
      {!small && <GripVertical className="h-4 w-4 shrink-0 opacity-60" />}
      <span className="truncate">{text}</span>
    </button>
  );
}

function Zone({ id, label, children, onTap }: { id: string; label?: string; children?: React.ReactNode; onTap: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${id}` });
  return (
    <div
      ref={setNodeRef}
      data-zone={id}
      onClick={onTap}
      className={`relative flex h-full w-full items-center justify-center rounded-[14px] border-[2.5px] border-dashed transition ${isOver ? 'border-[#ffd23f] bg-[#fff6c2]' : 'border-[#14135a] bg-[#fbf0d9]/95'}`}
      style={{ boxShadow: isOver ? '0 0 18px #ffd23f' : '0 2px 6px rgba(0,0,0,0.3)' }}
    >
      {label && !children && <span className="game-title text-[#14135a]/50" style={{ fontSize: ZONE_FONT }}>{label}</span>}
      {children}
    </div>
  );
}

function Pool({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' });
  return <div ref={setNodeRef} className={`grid grid-cols-2 gap-2.5 rounded-2xl p-2 transition ${isOver ? 'bg-white/10' : ''}`}>{children}</div>;
}

/** Student control: drag labels into diagram zones; tap-to-place also works. */
export function DragDropBoard({ diagram, zones, items, value, onChange, disabled }: {
  diagram: DiagramSpec;
  zones: { id: string; x: number; y: number; w: number; h: number; label?: string }[];
  items: { id: string; text: string }[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const placedIds = new Set(Object.values(value));
  const colorOf = (id: string) => items.findIndex((i) => i.id === id);
  const textOf = (id: string) => items.find((i) => i.id === id)?.text ?? '';

  const place = (itemId: string, target: string) => {
    const next = { ...value };
    for (const [z, it] of Object.entries(next)) if (it === itemId) delete next[z];
    if (target.startsWith('zone:')) {
      const zid = target.slice(5);
      next[zid] = itemId; // replaces any item already there (it returns to the pool)
    }
    onChange(next);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    if (!e.over) return;
    place(String(e.active.id).replace(/^placed:/, ''), String(e.over.id));
  };
  const tapZone = (zid: string) => {
    if (selected) { place(selected, `zone:${zid}`); setSelected(null); }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={fingerFirst} measuring={MEASURE} autoScroll={{ threshold: { x: 0, y: 0.06 }, acceleration: 6 }} onDragStart={(e) => { setActive(String(e.active.id).replace(/^placed:/, '')); setSelected(null); }} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={`flex flex-col gap-3 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
        <div className="rounded-2xl p-[3px] shadow-[0_0_0_2px_#38e1ff,0_0_20px_rgba(56,225,255,0.5)]">
          <DiagramWithZones
            diagram={diagram}
            zones={zones}
            renderZone={(z) => (
              <Zone id={z.id} label={z.label} onTap={() => tapZone(z.id)}>
                {value[z.id] && <Chip id={`placed:${value[z.id]}`} text={textOf(value[z.id])} color={colorOf(value[z.id])} small />}
              </Zone>
            )}
          />
        </div>
        <Pool>
          {items.filter((i) => !placedIds.has(i.id)).map((i) => (
            <Chip key={i.id} id={i.id} text={i.text} color={colorOf(i.id)} selected={selected === i.id} onTap={() => setSelected(selected === i.id ? null : i.id)} />
          ))}
          {items.every((i) => placedIds.has(i.id)) && <p className="col-span-2 py-2 text-center text-sm font-bold text-[#3dff7a]">All labels placed ✓ — drag to rearrange</p>}
        </Pool>
        <div className="flex items-center justify-between text-xs font-bold text-white/60">
          <span>Tip: drag, or tap a label then tap a box.</span>
          <button onClick={() => onChange({})} className="flex items-center gap-1"><RotateCcw className="h-4 w-4" /> Reset</button>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <div className="game-title rounded-full bg-gradient-to-b from-white to-[#e2e8ff] px-4 py-2 text-lg text-[#14135a] shadow-[0_0_0_3px_#ffd23f,0_8px_20px_rgba(0,0,0,0.4)]">{textOf(active)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
