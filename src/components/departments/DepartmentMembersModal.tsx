import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Trash2, UserPlus, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { MemberPickerDialog } from '../common/MemberPickerDialog';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types';

interface DepartmentMembersModalProps {
  departmentId: string;
  isOpen: boolean;
  onClose: () => void;
}

type DeptMemberRow = {
  userId: string;
  joinedAt: string;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';

const roleLabel = (role: Role) => role.replace('_', ' ');

export const DepartmentMembersModal: React.FC<DepartmentMembersModalProps> = ({
  departmentId,
  isOpen,
  onClose
}) => {
  const { departments, addDepartmentMembers, removeDepartmentMember } = useWorkspaceStore();
  const { user, allUsers, fetchUsers, updateUserRole } = useAuthStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [memberRows, setMemberRows] = useState<DeptMemberRow[]>([]);

  const department = departments.find(d => d.id === departmentId);

  const joinedAtByUser = useMemo(
    () => new Map(memberRows.map(row => [row.userId, row.joinedAt])),
    [memberRows]
  );

  const members = useMemo(
    () => allUsers.filter(u => u.departmentId === departmentId),
    [allUsers, departmentId]
  );

  const memberIds = useMemo(() => members.map(m => m.id), [members]);

  const canManage =
    user?.role === 'SUPER_ADMIN' ||
    (user?.role === 'ADMIN' && user.departmentId === departmentId);

  const refreshMemberRows = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`/api/departments/${departmentId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      setMemberRows(
        rows.map((row: { userId: string; createdAt: string }) => ({
          userId: row.userId,
          joinedAt: row.createdAt
        }))
      );
    } catch {
      setMemberRows([]);
    }
  };

  useEffect(() => {
    if (!isOpen || !departmentId) return;
    refreshMemberRows();
  }, [isOpen, departmentId]);

  const handleAdd = async (userIds: string[]) => {
    if (userIds.length === 0) return;
    setBusy(true);
    try {
      await addDepartmentMembers(departmentId, userIds);
      await fetchUsers();
      await refreshMemberRows();
      toast.success(
        userIds.length === 1 ? 'Member added to department' : `${userIds.length} members added`
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to add members');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (department?.adminId === userId) {
      toast.error('Change the department lead before removing them');
      return;
    }
    if (!window.confirm(`Remove ${name} from ${department?.name || 'this department'}?`)) return;
    setBusy(true);
    try {
      await removeDepartmentMember(departmentId, userId);
      await fetchUsers();
      toast.success(`Removed ${name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member');
    } finally {
      setBusy(false);
    }
  };

  const handlePromote = async (userId: string, name: string) => {
    if (
      !window.confirm(
        `Promote ${name} to department admin? They will manage members, invites, and tasks for this department.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await updateUserRole(userId, 'ADMIN', departmentId);
      toast.success(`${name} is now a department admin`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to promote member');
    } finally {
      setBusy(false);
    }
  };

  const handleDemote = async (userId: string, name: string) => {
    if (department?.adminId === userId) {
      toast.error('Change the department lead before demoting this admin');
      return;
    }
    if (
      !window.confirm(
        `Demote ${name} back to member? They will lose department admin access.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await updateUserRole(userId, 'MEMBER', departmentId);
      toast.success(`${name} is now a member`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to demote admin');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={department ? `${department.name} members` : 'Department members'}
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Add people who already joined the company. Promote long-standing members to
            department admin when they are ready to lead.
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

          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden'
            }}
          >
            {members.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem'
                }}
              >
                <Users size={28} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                <div>No members yet</div>
              </div>
            ) : (
              members.map(member => {
                const joinedAt = joinedAtByUser.get(member.id);
                const tenure = joinedAt
                  ? `Member for ${formatDistanceToNow(new Date(joinedAt), { addSuffix: false })}`
                  : null;

                return (
                  <div
                    key={member.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid var(--border-color)'
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
                      <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                        {member.name}
                        {department?.adminId === member.id && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.7rem',
                              color: 'var(--primary)',
                              fontWeight: 600
                            }}
                          >
                            Lead
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {member.email}
                        {tenure ? ` · ${tenure}` : ''}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        {roleLabel(member.role)}
                      </div>
                    </div>
                    {canManage && member.id !== user?.id && member.role !== 'SUPER_ADMIN' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {member.role === 'MEMBER' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.4rem', color: 'var(--primary)' }}
                            disabled={busy}
                            onClick={() => handlePromote(member.id, member.name)}
                            title="Promote to department admin"
                          >
                            <ArrowUpCircle size={16} />
                          </button>
                        )}
                        {member.role === 'ADMIN' && department?.adminId !== member.id && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.4rem', color: 'var(--text-secondary)' }}
                            disabled={busy}
                            onClick={() => handleDemote(member.id, member.name)}
                            title="Demote to member"
                          >
                            <ArrowDownCircle size={16} />
                          </button>
                        )}
                        {department?.adminId !== member.id && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.4rem', color: 'var(--error)' }}
                            disabled={busy}
                            onClick={() => handleRemove(member.id, member.name)}
                            title="Remove from department"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      <MemberPickerDialog
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add to department"
        description="Select company users to assign to this department. Leave empty if you only want to review."
        users={allUsers}
        excludeIds={memberIds}
        confirmLabel="Add to department"
        onConfirm={handleAdd}
      />
    </>
  );
};
