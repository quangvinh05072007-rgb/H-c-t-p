import { useState } from 'react';
import { get, post } from '../../api';
import { go, useApp, useAsync } from '../../ui/kit';
import { ClassDirectoryGrid } from '../classroom/ClassDirectoryGrid';
import type { ClassroomSummary } from '../classroom/types';

type ClassesResponse = {
  classes: ClassroomSummary[];
  totalAllCount?: number;
  myCount?: number;
  total?: number;
};

export function Classes() {
  const { user, toast } = useApp();
  const [scope, setScope] = useState<'mine' | 'all'>(user.role === 'admin' ? 'all' : 'mine');

  const queryParams = new URLSearchParams();
  if (scope === 'all') queryParams.set('scope', 'all');
  queryParams.set('limit', '100');

  const { data, error, loading, reload } = useAsync(
    () => get<ClassesResponse>(`/api/classes?${queryParams.toString()}`),
    [scope],
  );

  const classes = data?.classes ?? [];

  const handleCreateClass = async (name: string, grade: number) => {
    const res = await post<{ id: number; name: string; grade: number; code: string }>('/api/classes', {
      name,
      grade,
    });
    toast(`Đã tạo lớp ${res.name} (Mã: ${res.code})`);
    reload();
  };

  return (
    <ClassDirectoryGrid
      role={user.role}
      classes={classes}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      onOpenClass={(cls) => go(`/lop/${cls.id}`)}
      onCreateClass={handleCreateClass}
      adminScope={scope}
      onAdminScopeChange={setScope}
      totalAllCount={data?.totalAllCount ?? classes.length}
      myCount={data?.myCount ?? 0}
    />
  );
}

export default Classes;
