// The Pipeline view: Belts, Queue and Done. It has no side list and no details panel, as in v1.
import { MotionConfig } from 'motion/react';
import type { ViewChunk } from '../../app/views';
import { useApp } from '../../store';
import { Belts } from './belts';
import { Done } from './done';
import { Queue } from './queue';
import './pipeline.css';

function Main() {
  const tab = useApp((s) => s.route.tab);
  return (
    <MotionConfig reducedMotion="user">
      {tab === 'queue' ? <Queue /> : tab === 'done' ? <Done /> : <Belts />}
    </MotionConfig>
  );
}

export default { Main } satisfies ViewChunk;
