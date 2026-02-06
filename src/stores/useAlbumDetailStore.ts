import { create } from 'zustand';

export interface Folder {
    id: string;
    name: string;
    createdAt: string;
}

interface UploadProgress {
    current: number;
    total: number;
    fileName: string;
    percent: number;
}

interface AlbumDetailState {
    // Folder Navigation
    currentFolderId: string | null;

    // Sorting
    sortBy: 'createdAt' | 'dateTaken';
    sortDir: 'asc' | 'desc';

    // Selection (Bulk Actions)
    selectMode: boolean;
    selectedIds: Set<string>;
    bulkOperating: boolean;

    // Upload State
    uploading: boolean;
    uploadProgress: UploadProgress;
    isDragging: boolean;

    // Actions
    setCurrentFolderId: (id: string | null) => void;
    setSort: (sortBy: 'createdAt' | 'dateTaken', sortDir: 'asc' | 'desc') => void;

    toggleSelectMode: () => void;
    toggleSelection: (id: string) => void;
    selectAll: (ids: string[]) => void;
    deselectAll: () => void;
    setBulkOperating: (isOperating: boolean) => void;

    setUploading: (isUploading: boolean) => void;
    setUploadProgress: (progress: UploadProgress) => void;
    setIsDragging: (isDragging: boolean) => void;

    reset: () => void;
}

export const useAlbumDetailStore = create<AlbumDetailState>((set) => ({
    // Initial State
    currentFolderId: null,

    sortBy: 'createdAt',
    sortDir: 'desc',

    selectMode: false,
    selectedIds: new Set(),
    bulkOperating: false,

    uploading: false,
    uploadProgress: { current: 0, total: 0, fileName: '', percent: 0 },
    isDragging: false,

    // Actions
    setCurrentFolderId: (id) => set({ currentFolderId: id }),

    setSort: (sortBy, sortDir) => set({ sortBy, sortDir }),

    toggleSelectMode: () => set((state) => ({
        selectMode: !state.selectMode,
        selectedIds: new Set() // Clear selection when toggling mode
    })),

    toggleSelection: (id) => set((state) => {
        const newSelected = new Set(state.selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        return { selectedIds: newSelected };
    }),

    selectAll: (ids) => set({ selectedIds: new Set(ids) }),

    deselectAll: () => set({ selectedIds: new Set() }),

    setBulkOperating: (bulkOperating) => set({ bulkOperating }),

    setUploading: (uploading) => set({ uploading }),

    setUploadProgress: (uploadProgress) => set({ uploadProgress }),

    setIsDragging: (isDragging) => set({ isDragging }),

    reset: () => set({
        currentFolderId: null,
        sortBy: 'createdAt',
        sortDir: 'desc',
        selectMode: false,
        selectedIds: new Set(),
        bulkOperating: false,
        uploading: false,
        uploadProgress: { current: 0, total: 0, fileName: '', percent: 0 },
        isDragging: false,
    })
}));
