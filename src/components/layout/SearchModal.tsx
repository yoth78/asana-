import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FolderKanban, CheckSquare, X } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAuthStore } from '../../store/authStore';
import { filterVisibleProjects } from '../../utils/projectAccess';

interface SearchModalProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}

const isTopLevel = (t: { parentTaskId?: string | null }) => !t.parentTaskId;

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  query,
  onQueryChange,
  onClose
}) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { projects, tasks } = useWorkspaceStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const normalized = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalized) return { projects: [] as typeof projects, tasks: [] as typeof tasks };

    const visibleProjects = filterVisibleProjects(projects, user);
    const visibleProjectIds = new Set(visibleProjects.map(p => p.id));

    const matchedProjects = visibleProjects.filter(
      p =>
        p.name.toLowerCase().includes(normalized) ||
        p.description?.toLowerCase().includes(normalized)
    );

    const matchedTasks = tasks.filter(
      t =>
        isTopLevel(t) &&
        visibleProjectIds.has(t.projectId) &&
        (t.title.toLowerCase().includes(normalized) ||
          t.description?.toLowerCase().includes(normalized))
    );

    return { projects: matchedProjects.slice(0, 5), tasks: matchedTasks.slice(0, 8) };
  }, [normalized, projects, tasks, user]);

  const hasResults = results.projects.length > 0 || results.tasks.length > 0;

  const goToProject = (id: string) => {
    onClose();
    navigate(`/projects/${id}`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          className="w-full max-w-xl rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)]">
            <Search size={18} className="text-[var(--text-muted)] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="Search tasks and projects…"
              className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] text-sm"
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-2">
            {!normalized ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-8 m-0">
                Type to search across your workspace
              </p>
            ) : !hasResults ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-8 m-0">
                No results for &ldquo;{query}&rdquo;
              </p>
            ) : (
              <>
                {results.projects.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-2 py-1 m-0">
                      Projects
                    </p>
                    {results.projects.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goToProject(p.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] text-left cursor-pointer border-none bg-transparent"
                      >
                        <FolderKanban size={16} style={{ color: p.color }} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] m-0 truncate">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-[var(--text-muted)] m-0 truncate">{p.description}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {results.tasks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-2 py-1 m-0">
                      Tasks
                    </p>
                    {results.tasks.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => goToProject(t.projectId)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] text-left cursor-pointer border-none bg-transparent"
                      >
                        <CheckSquare size={16} className="text-[var(--primary)] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] m-0 truncate">{t.title}</p>
                          <p className="text-xs text-[var(--text-muted)] m-0">{t.status.replace('_', ' ')}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
