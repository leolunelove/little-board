import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";

// A pointer must actually be inside the list. Prefer its row over the enclosing
// section, so a section centre cannot steal a drop from a nearby task.
export const memoCollision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const hits = pointerWithin(args);
    const rows = hits.filter(
      (hit) => hit.data?.droppableContainer.data.current?.kind === "task",
    );
    return rows.length ? rows : hits;
  }
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) =>
        container.data.current?.kind === "task" ||
        container.data.current?.count === 0,
    ),
  });
};
