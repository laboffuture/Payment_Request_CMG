'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectDto } from '@cm/shared';
import { get, post } from '@mm/lib/api';
import { DataTable, type Column } from '@mm/components/DataTable';
import { Btn, Card, PageHeader } from '@mm/components/ui';
import { useToast } from '@mm/components/Toast';

/**
 * Prototype: VIEWS.projects, A.addProject.
 * Projects from the Payment app are read-only; a local one is added only when
 * it is not in the Payment app (§10).
 */
export default function ProjectsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const projects = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: () => get<ProjectDto[]>('/admin/projects'),
  });

  const add = useMutation({
    mutationFn: () => post<ProjectDto>('/admin/projects', { code, name }),
    onSuccess: () => {
      toast('Project added');
      setCode('');
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      void queryClient.invalidateQueries({ queryKey: ['reference'] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not add'),
  });

  // The job register in Payment → Settings is the source; this pulls it now.
  const sync = useMutation({
    mutationFn: () => post<{ projects: number }>('/admin/projects/sync'),
    onSuccess: (r) => {
      toast(r.projects ? `${r.projects} project(s) brought in from the Payment app` : 'Already up to date');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      void queryClient.invalidateQueries({ queryKey: ['reference'] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not sync'),
  });

  const columns: Column<ProjectDto>[] = [
    { key: 'code', header: 'Code', render: (p) => <span className="font-mono">{p.code}</span> },
    { key: 'name', header: 'Name', render: (p) => p.name },
    { key: 'source', header: 'Source', render: (p) => p.sourceLabel },
    { key: 'mrs', header: 'MRs', align: 'right', render: (p) => p.mrCount ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Projects come from the job register (JB code, project, site) in Payment → Settings, and refresh every 15 minutes. Add one here only if it is not a payment job."
        actions={
          <Btn disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Syncing…' : 'Sync from Payment app'}
          </Btn>
        }
      />

      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-[10px]">
          <input
            aria-label="Project code"
            placeholder="Project code"
            className="w-[160px]"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            aria-label="Project name"
            placeholder="Project name"
            className="flex-1 min-w-[180px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Btn variant="primary" disabled={add.isPending} onClick={() => add.mutate()}>
            Add project
          </Btn>
        </div>
      </Card>

      {projects.isLoading ? (
        <div className="text-mut">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={projects.data ?? []}
          rowKey={(p) => p.id}
          emptyText="No projects yet"
        />
      )}
    </>
  );
}
