import { createEquityQueue } from './equity.queue';
import type { EquityRequest } from './equity.protocol';

const queue = createEquityQueue(message => postMessage(message), callback => { setTimeout(callback, 0); });
self.onmessage = (event: MessageEvent<EquityRequest>) => queue.receive(event.data);
