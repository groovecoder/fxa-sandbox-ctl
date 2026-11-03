// The Stats view's lazy chunk: the main pane, and the filters in the side panel.
import type { ViewChunk } from '../../app/views';
import { Main } from './Main';
import { Side } from './Side';

const chunk: ViewChunk = { Main, Side };
export default chunk;
