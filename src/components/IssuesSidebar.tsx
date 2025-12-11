import { Issue } from '../App';
import { AlertCircle, AlertTriangle, Info, Type, Palette, LayoutGrid, Maximize2, ArrowUpDown } from 'lucide-react';

interface IssuesSidebarProps {
  issues: Issue[];
  selectedIssue: Issue | null;
  onSelectIssue: (issue: Issue | null) => void;
}

const issueIcons = {
  Font: Type,
  Color: Palette,
  Layout: LayoutGrid,
  Padding: Maximize2,
  Spacing: ArrowUpDown,
};

const severityConfig = {
  High: {
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-950/30',
    border: 'border-red-900/50',
  },
  Medium: {
    icon: AlertTriangle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-950/30',
    border: 'border-yellow-900/50',
  },
  Low: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-950/30',
    border: 'border-blue-900/50',
  },
};

export function IssuesSidebar({ issues, selectedIssue, onSelectIssue }: IssuesSidebarProps) {
  const issuesByType = issues.reduce((acc, issue) => {
    if (!acc[issue.type]) acc[issue.type] = [];
    acc[issue.type].push(issue);
    return acc;
  }, {} as Record<string, Issue[]>);

  return (
    <div className="w-96 border-l border-zinc-800 bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-4">
        <h3 className="font-mono text-zinc-400">Detected Issues</h3>
        <p className="mt-1 font-mono text-zinc-500">
          {issues.length} issue{issues.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 border-b border-zinc-800 p-4">
        <div className="rounded border border-red-900/50 bg-red-950/20 p-2 text-center">
          <p className="font-mono text-red-400">
            {issues.filter((i) => i.severity === 'High').length}
          </p>
          <p className="mt-1 font-mono text-red-600">High</p>
        </div>
        <div className="rounded border border-yellow-900/50 bg-yellow-950/20 p-2 text-center">
          <p className="font-mono text-yellow-400">
            {issues.filter((i) => i.severity === 'Medium').length}
          </p>
          <p className="mt-1 font-mono text-yellow-600">Medium</p>
        </div>
        <div className="rounded border border-blue-900/50 bg-blue-950/20 p-2 text-center">
          <p className="font-mono text-blue-400">
            {issues.filter((i) => i.severity === 'Low').length}
          </p>
          <p className="mt-1 font-mono text-blue-600">Low</p>
        </div>
      </div>

      {/* Issues List */}
      <div className="h-[calc(100vh-380px)] overflow-auto p-4">
        {Object.entries(issuesByType).map(([type, typeIssues]) => {
          const Icon = issueIcons[type as keyof typeof issueIcons];
          return (
            <div key={type} className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="size-4 text-zinc-500" />
                <h4 className="font-mono text-zinc-400">{type}</h4>
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-zinc-500">
                  {typeIssues.length}
                </span>
              </div>
              <div className="space-y-2">
                {typeIssues.map((issue) => {
                  const config = severityConfig[issue.severity];
                  const SeverityIcon = config.icon;
                  const isSelected = selectedIssue?.id === issue.id;

                  return (
                    <button
                      key={issue.id}
                      onClick={() => onSelectIssue(isSelected ? null : issue)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-950/30 ring-1 ring-purple-500'
                          : `${config.border} ${config.bg} hover:border-zinc-600`
                      }`}
                    >
                      <div className="mb-2 flex items-start gap-2">
                        <SeverityIcon className={`mt-0.5 size-4 ${config.color}`} />
                        <div className="flex-1">
                          <p className={`font-mono ${config.color}`}>{issue.severity}</p>
                        </div>
                      </div>
                      <p className="font-mono text-zinc-300">{issue.message}</p>
                      <div className="mt-2 flex gap-2 font-mono text-zinc-600">
                        <span>
                          x: {issue.region.x}, y: {issue.region.y}
                        </span>
                        <span>•</span>
                        <span>
                          {issue.region.width}×{issue.region.height}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {issues.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-3 size-12 mx-auto rounded-full bg-green-950/30 flex items-center justify-center">
                <Info className="size-6 text-green-500" />
              </div>
              <p className="font-mono text-zinc-400">Perfect match!</p>
              <p className="mt-1 font-mono text-zinc-600">No issues detected</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}