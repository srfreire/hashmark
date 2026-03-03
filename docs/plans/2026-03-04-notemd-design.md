# NoteMD - Editor Markdown WYSIWYG tipo Notion

## Resumen

App de escritorio para visualizar y editar archivos Markdown locales con experiencia WYSIWYG tipo Notion.

## Stack

- **Tauri v2** - shell de escritorio (Rust backend + webview)
- **React + TypeScript** - frontend
- **Tiptap v2** - editor WYSIWYG
- **Tailwind CSS** - estilos
- **Vite** - bundler

## Flujo de datos

```
Carpeta local → Tauri FS API (Rust) → React frontend → Tiptap editor
                                                          ↓
                                              Markdown serialización
                                                          ↓
                                              Tauri FS API → Guardar archivo
```

## Componentes

### 1. Sidebar (árbol de archivos)

- Seleccionar carpeta raíz via diálogo nativo
- Árbol jerárquico de carpetas y archivos `.md`
- Click para abrir archivo
- Crear nuevo archivo/carpeta
- Archivo activo resaltado

### 2. Editor WYSIWYG (Tiptap)

- Headings (H1-H3)
- Texto con formato: bold, italic, strikethrough, code inline
- Listas: bullet, numbered, checkbox/todo
- Bloques de código con syntax highlighting
- Blockquotes, links, separadores horizontales
- Toolbar flotante al seleccionar texto
- Slash commands (`/`) para insertar bloques

### 3. Serialización Markdown

- Abrir: parsear `.md` → modelo Tiptap
- Guardar: modelo Tiptap → `.md`
- Auto-save con debounce (1s)

### 4. UI/Layout

- Sidebar izquierda (250px, colapsable)
- Área de edición centrada (max-width ~720px)
- Tema claro/oscuro
- Barra superior: nombre del archivo, estado de guardado
