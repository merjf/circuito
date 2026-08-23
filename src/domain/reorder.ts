/**
 * Moving an item within an ordered list.
 *
 * Lives here rather than inline in the builder because drag-and-drop is easy to
 * get subtly wrong — a swap is not the same as a move, and the difference only
 * shows when you drag across more than one position. Swapping A,B,C,D from 0→2
 * gives C,B,A,D; moving gives B,C,A,D. The second is what a dragged row does.
 */

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
