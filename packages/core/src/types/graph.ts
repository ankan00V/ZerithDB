/** Unique identifier for a graph node */
export type GraphNodeId = string;

/** Label on a directed edge (e.g. 'friends', 'likes', 'follows') */
export type EdgeLabel = string;

/** A graph node storing arbitrary typed data */
export interface GraphNode<T extends Record<string, any> = Record<string, any>> {
  _id: GraphNodeId;
  _createdAt: number;
  _updatedAt: number;
  data: T;
}

/** A directed edge between two nodes */
export interface GraphEdge {
  _id: string;
  from: GraphNodeId;
  to: GraphNodeId;
  label: EdgeLabel;
  weight?: number;
  data?: Record<string, any>;
  _createdAt: number;
  _updatedAt: number;
}

/** Result returned by a traversal's .result() call */
export interface GraphTraversalResult<T extends Record<string, any> = Record<string, any>> {
  nodes: GraphNode<T>[];
  edges: GraphEdge[];
}
