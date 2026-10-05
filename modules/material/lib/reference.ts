'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CategoryDto,
  CompanyDto,
  ProjectDto,
  VendorDto,
} from '@cm/shared';
import { get } from './api';

/**
 * Projects, categories, vendors and companies — the lists nearly every page
 * needs for its filters and pickers.
 *
 * The server scopes them to the caller: a site engineer gets only their own
 * projects, and a vendor gets no vendor or company list at all (§3).
 */
export interface Reference {
  projects: ProjectDto[];
  categories: CategoryDto[];
  vendors: VendorDto[];
  companies: CompanyDto[];
}

const EMPTY: Reference = {
  projects: [],
  categories: [],
  vendors: [],
  companies: [],
};

export const referenceQuery = () => ({
  queryKey: ['reference'] as const,
  queryFn: () => get<Reference>('/reference'),
  staleTime: 5 * 60_000,
});

export function useReference(): Reference {
  const query = useQuery(referenceQuery());
  return query.data ?? EMPTY;
}

/** Active sub-categories of one main category — for the item forms. */
export function subCategoriesOf(
  reference: Reference,
  mainCategory: string,
): string[] {
  const main = reference.categories.find((c) => c.name === mainCategory);
  return (main?.children ?? []).filter((c) => c.active).map((c) => c.name);
}
