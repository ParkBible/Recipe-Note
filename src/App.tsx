import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RecipeListPage } from '@/pages/RecipeListPage';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';
import { AddRecipePage } from '@/pages/AddRecipePage';
import { FridgePage } from '@/pages/FridgePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <RecipeListPage /> },
      { path: '/recipes/:id', element: <RecipeDetailPage /> },
      { path: '/add', element: <AddRecipePage /> },
      { path: '/fridge', element: <FridgePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
