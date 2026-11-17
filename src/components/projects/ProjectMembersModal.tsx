import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Shield, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { MemberPickerDialog } from '../common/MemberPickerDialog';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAuthStore } from '../../store/authStore';
import type { ProjectMemberRole } from '../../types';

interface ProjectMembersModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';

export const ProjectMembersModal: React.FC<ProjectMembersModalProps> = ({
  projectId,
  isOpen,
  onClose
}) => {
  const {
    fetchProjectMembers,
    getProjectMembers,
    addProjectMembers,
    updateProjectMemberRole,
    removeProjectMember
  } = useWorkspaceStore();
  const { user, allUsers } = useAuthStore();

  const members = getProjectMembers(projectId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetchProjectMembers(projectId).catch((err: any) => {
      toast.error(err.message || 'Failed to load members');
    });
  }, [isOpen, projectId, fetchProjectMembers]);

  const memberIds = useMemo(() => members.map(m => m.userId), [members]);

  const canManage =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    members.some(m => m.userId === user?.id && m.role === 'ADMIN');

  const handleAdd = async (userIds: string[]) => {
    if (userIds.length === 0) return;
    setBusy(true);
    try {
      await addProjectMembers(projectId, userIds, 'MEMBER');
      toast.success(
        userIds.length === 1 ? 'Added to project' : `${userIds.length} members added`
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to add members');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (userId: string, role: ProjectMemberRole) => {
    setBusy(true);
    try {
      await updateProjectMemberRole(projectId, userId, role);
      toast.success('Role updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    setBusy(true);
    try {
      await removeProjectMember(projectId, userId);
      toast.success(`Removed ${name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Project members" size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Only people already in this company can be added. Project admins manage the roster and
            can receive restricted DMs.
          </p>

          {canManage && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => setPickerOpen(true)}
              disabled={busy}
            >
              <UserPlus size={16} /> Add members
            </button>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {members.length === 0 ? (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                No project members yet
              </div>
            ) : (
              members.map(member => (
                <div
                  key={member.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-body)'
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      flexShrink: 0
                    }}
                  >
                    {initials(member.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{member.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.email}</div>
                  </div>
                  {canManage ? (
                    <select
                      className="select"
                      style={{ width: 'auto', fontSize: '0.8rem' }}
                      value={member.role}
                      disabled={busy}
                      onChange={e =>
                        handleRoleChange(member.userId, e.target.value as ProjectMemberRole)
                      }
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Project admin</option>
                    </select>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {member.role === 'ADMIN' && <Shield size={12} />}
                      {member.role === 'ADMIN' ? 'Admin' : 'Member'}
                    </span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.4rem', color: 'var(--error)' }}
                      disabled={busy}
                      onClick={() => handleRemove(member.userId, member.name)}
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      <MemberPickerDialog
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add project members"
        description="Select one or more company users to invite into this project."
        users={allUsers}
        excludeIds={memberIds}
        confirmLabel="Add to project"
        onConfirm={handleAdd}
      />
    </>
  );
};
