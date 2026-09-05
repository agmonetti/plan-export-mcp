declare module 'markdown-it-task-lists' {
  export interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const taskLists: (md: any, options?: TaskListsOptions) => void;
  export default taskLists;
}
