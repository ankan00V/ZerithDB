import { type Table } from "dexie";
import { v7 as uuidv7 } from "uuid";
import type {
  GraphNode,
  GraphEdge,
  GraphNodeId,
  EdgeLabel,
  GraphTraversalResult,
} from "zerithdb-core";
import { ZerithDBError, ErrorCode } from "zerithdb-core";
import { wrapIDBOperation } from "./internal/wrap-idb-operation.js";

/**
 * Fluent graph traversal builder.
 * Created by calling GraphClient.traverse(startNodeId).
 */
export class GraphTraversal<T extends Record<string, any> = Record<string, any>> {
  private readonly visited = new Set<GraphNodeId>();
  private currentNodes: GraphNode<T>[] = [];
  private traversedEdges: GraphEdge[] = [];

  constructor(
    private readonly nodesTable: Table<GraphNode<T>>,
    private readonly edgesTable: Table<GraphEdge>,
    startNode: GraphNode<T>
  ) {
    this.currentNodes = [startNode];
    this.visited.add(startNode._id);
  }

  /**
   * Follow outgoing edges, optionally filtered by label.
   * @example await traverse(aliceId).out('friends')
   */
  async out(label?: EdgeLabel): Promise<GraphTraversal<T>> {
    const nextNodes: GraphNode<T>[] = [];
    for (const node of this.currentNodes) {
      const edges = await this.edgesTable.where("from").equals(node._id).toArray();
      const filtered = label ? edges.filter((e) => e.label === label) : edges;
      for (const edge of filtered) {
        if (!this.visited.has(edge.to)) {
          const target = await this.nodesTable.get(edge.to);
          if (target) {
            this.visited.add(edge.to);
            nextNodes.push(target);
            this.traversedEdges.push(edge);
          }
        }
      }
    }
    this.currentNodes = nextNodes;
    return this;
  }

  /**
   * Follow incoming edges, optionally filtered by label.
   */
  async in(label?: EdgeLabel): Promise<GraphTraversal<T>> {
    const nextNodes: GraphNode<T>[] = [];
    for (const node of this.currentNodes) {
      const edges = await this.edgesTable.where("to").equals(node._id).toArray();
      const filtered = label ? edges.filter((e) => e.label === label) : edges;
      for (const edge of filtered) {
        if (!this.visited.has(edge.from)) {
          const source = await this.nodesTable.get(edge.from);
          if (source) {
            this.visited.add(edge.from);
            nextNodes.push(source);
            this.traversedEdges.push(edge);
          }
        }
      }
    }
    this.currentNodes = nextNodes;
    return this;
  }

  /**
   * Follow both incoming and outgoing edges, optionally filtered by label.
   */
  async both(label?: EdgeLabel): Promise<GraphTraversal<T>> {
    const nextNodes: GraphNode<T>[] = [];
    for (const node of this.currentNodes) {
      const [outEdges, inEdges] = await Promise.all([
        this.edgesTable.where("from").equals(node._id).toArray(),
        this.edgesTable.where("to").equals(node._id).toArray(),
      ]);
      const allEdges = [...outEdges, ...inEdges];
      const filtered = label ? allEdges.filter((e) => e.label === label) : allEdges;
      for (const edge of filtered) {
        const neighborId = edge.from === node._id ? edge.to : edge.from;
        if (!this.visited.has(neighborId)) {
          const neighbor = await this.nodesTable.get(neighborId);
          if (neighbor) {
            this.visited.add(neighborId);
            nextNodes.push(neighbor);
            this.traversedEdges.push(edge);
          }
        }
      }
    }
    this.currentNodes = nextNodes;
    return this;
  }

  /** Return the current nodes and all traversed edges */
  result(): GraphTraversalResult<T> {
    return {
      nodes: [...this.currentNodes],
      edges: [...this.traversedEdges],
    };
  }
}

/**
 * Client for a named graph within ZerithDB.
 * Manages nodes and directed labeled edges stored in IndexedDB.
 *
 * @example
 * ```typescript
 * const social = app.graph('social');
 * const aliceId = await social.addNode({ name: 'Alice' });
 * const bobId   = await social.addNode({ name: 'Bob' });
 * await social.addEdge(aliceId, bobId, 'friends');
 *
 * const result = await (await social.traverse(aliceId)).out('friends').result();
 * // result.nodes → [{ data: { name: 'Bob' }, ... }]
 * ```
 */
export class GraphClient<T extends Record<string, any> = Record<string, any>> {
  constructor(
    private readonly nodesTable: Table<GraphNode<T>>,
    private readonly edgesTable: Table<GraphEdge>,
    private readonly graphName: string
  ) {}

  /** Add a node to the graph and return its ID */
  async addNode(data: T): Promise<GraphNodeId> {
    const now = Date.now();
    const node: GraphNode<T> = { _id: uuidv7(), _createdAt: now, _updatedAt: now, data };
    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to add node to graph "${this.graphName}"`,
      async () => {
        await this.nodesTable.add(node);
        return node._id;
      }
    );
  }

  /** Get a node by ID */
  async getNode(id: GraphNodeId): Promise<GraphNode<T> | undefined> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to get node "${id}" from graph "${this.graphName}"`,
      () => this.nodesTable.get(id)
    );
  }

  /** Add a directed edge between two nodes */
  async addEdge(
    from: GraphNodeId,
    to: GraphNodeId,
    label: EdgeLabel,
    data?: Record<string, any>,
    weight?: number
  ): Promise<string> {
    const now = Date.now();
    const edge: GraphEdge = {
      _id: uuidv7(),
      from,
      to,
      label,
      weight,
      data,
      _createdAt: now,
      _updatedAt: now,
    };
    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to add edge to graph "${this.graphName}"`,
      async () => {
        await this.edgesTable.add(edge);
        return edge._id;
      }
    );
  }

  /**
   * Remove a node AND all its connected edges (cascading delete).
   */
  async removeNode(id: GraphNodeId): Promise<void> {
    return wrapIDBOperation(
      ErrorCode.DB_DELETE_FAILED,
      `Failed to remove node "${id}" from graph "${this.graphName}"`,
      async () => {
        const [outEdges, inEdges] = await Promise.all([
          this.edgesTable.where("from").equals(id).toArray(),
          this.edgesTable.where("to").equals(id).toArray(),
        ]);
        const edgeIds = [...outEdges, ...inEdges].map((e) => e._id);
        await this.edgesTable.bulkDelete(edgeIds);
        await this.nodesTable.delete(id);
      }
    );
  }

  /** Remove a single edge by ID */
  async removeEdge(id: string): Promise<void> {
    return wrapIDBOperation(
      ErrorCode.DB_DELETE_FAILED,
      `Failed to remove edge "${id}" from graph "${this.graphName}"`,
      () => this.edgesTable.delete(id)
    );
  }

  /** Get all nodes in the graph */
  async allNodes(): Promise<GraphNode<T>[]> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to get all nodes from graph "${this.graphName}"`,
      () => this.nodesTable.toArray()
    );
  }

  /** Get all edges in the graph */
  async allEdges(): Promise<GraphEdge[]> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to get all edges from graph "${this.graphName}"`,
      () => this.edgesTable.toArray()
    );
  }

  /** Start a traversal from a given node ID */
  async traverse(startNodeId: GraphNodeId): Promise<GraphTraversal<T>> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to start traversal in graph "${this.graphName}"`,
      async () => {
        const startNode = await this.nodesTable.get(startNodeId);
        if (!startNode) {
          throw new ZerithDBError(
            ErrorCode.DB_READ_FAILED,
            `Node "${startNodeId}" not found in graph "${this.graphName}"`
          );
        }
        return new GraphTraversal<T>(this.nodesTable, this.edgesTable, startNode);
      }
    );
  }
}
