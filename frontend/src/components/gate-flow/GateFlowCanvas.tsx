import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { GateNode } from './GateNode';
import type { GateNodeData, GateStatus } from './GateNode';

export interface Gate {
  gateType: string;
  label: string;
  status: GateStatus;
  description?: string;
  artifactsCount?: number;
  order: number;
}

interface GateFlowCanvasProps {
  gates: Gate[];
  onGateClick?: (gateType: string) => void;
}

const nodeTypes = {
  gateNode: GateNode,
};

// Gate definitions with coordinates
const GATE_DEFINITIONS = [
  { id: 'G0', label: 'Initial Setup', x: 400, y: 50 },
  { id: 'G1', label: 'Intake & Analysis', x: 400, y: 150 },
  { id: 'G2', label: 'PRD Approval', x: 400, y: 250 },
  { id: 'G3', label: 'Architecture Approval', x: 400, y: 350 },
  { id: 'G4', label: 'Design Approval', x: 400, y: 450 },
  { id: 'G5', label: 'Development Complete', x: 400, y: 550 },
  { id: 'G6', label: 'Testing Complete', x: 400, y: 650 },
  { id: 'G7', label: 'Security Approval', x: 400, y: 750 },
  { id: 'G8', label: 'Deployment Ready', x: 400, y: 850 },
  { id: 'G9', label: 'Production Launch', x: 400, y: 950 },
];

export const GateFlowCanvas: React.FC<GateFlowCanvasProps> = ({ gates, onGateClick }) => {
  // Convert gates to React Flow nodes
  const initialNodes: Node<GateNodeData>[] = useMemo(() => {
    return GATE_DEFINITIONS.map((def, index) => {
      const gate = gates.find((g) => g.gateType === def.id) || {
        gateType: def.id,
        label: def.label,
        status: 'BLOCKED' as GateStatus,
        order: index,
      };

      return {
        id: def.id,
        type: 'gateNode',
        position: { x: def.x, y: def.y },
        data: {
          gateType: gate.gateType,
          label: gate.label,
          status: gate.status,
          description: gate.description,
          artifactsCount: gate.artifactsCount,
          onViewDetails: onGateClick ? () => onGateClick(gate.gateType) : undefined,
        },
      };
    });
  }, [gates, onGateClick]);

  // Create edges (connections between gates)
  const initialEdges: Edge[] = useMemo(() => {
    return GATE_DEFINITIONS.slice(0, -1).map((def, index) => ({
      id: `e${def.id}-${GATE_DEFINITIONS[index + 1].id}`,
      source: def.id,
      target: GATE_DEFINITIONS[index + 1].id,
      type: 'smoothstep',
      animated: gates[index]?.status === 'IN_PROGRESS',
      style: {
        stroke: gates[index]?.status === 'APPROVED' ? '#10b981' : '#9ca3af',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: gates[index]?.status === 'APPROVED' ? '#10b981' : '#9ca3af',
      },
    }));
  }, [gates]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<GateNodeData>) => {
      if (onGateClick) {
        onGateClick(node.data.gateType);
      }
    },
    [onGateClick],
  );

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#aaa" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as GateNodeData;
            switch (data.status) {
              case 'APPROVED':
                return '#10b981';
              case 'IN_PROGRESS':
                return '#3b82f6';
              case 'READY':
                return '#eab308';
              case 'REJECTED':
                return '#ef4444';
              default:
                return '#9ca3af';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.2)"
        />
      </ReactFlow>
    </div>
  );
};
