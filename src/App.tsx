import { Routes, Route, Navigate } from 'react-router-dom'
import HomeScreen from './screens/HomeScreen'
import RecipeListScreen from './screens/RecipeListScreen'
import RecipeDetailScreen from './screens/RecipeDetailScreen'
import RecipeEditScreen from './screens/RecipeEditScreen'
import CategoriesScreen from './screens/CategoriesScreen'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/category/:id" element={<RecipeListScreen />} />
      <Route path="/favorites" element={<RecipeListScreen mode="favorites" />} />
      <Route path="/search" element={<RecipeListScreen mode="search" />} />
      <Route path="/recipe/new" element={<RecipeEditScreen />} />
      <Route path="/recipe/:id" element={<RecipeDetailScreen />} />
      <Route path="/recipe/:id/edit" element={<RecipeEditScreen />} />
      <Route path="/categories" element={<CategoriesScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
