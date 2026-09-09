MI BODEGA V33 FÁBRICA

Edición limpia para uso real.

INICIA VACÍO:
- Inventario
- Control de Salida
- Conteo Semanal
- Diferencias
- Sin Existencia
- Inventario Digital
- Códigos Nuevos
- Técnicos
- Bodegueros

NO incluye productos, personas ni registros de ejemplo.

FUNCIONES INCLUIDAS:
- Inventario con detalle y edición.
- Control de Salida con Técnico, Bodeguero y N. de Orden.
- Conteo Semanal.
- Inventario Digital por familia.
- Diferencias y ajuste de inventario.
- Sin Existencia con fecha y hora de detección.
- Impresión de Inventario Digital por familia en A4 vertical.
- Google Sheets como base central.
- BASE_PRODUCTOS.
- Importador TXT IRG077.
- Códigos Nuevos con Catálogo opcional.
- Guardado local primero y sincronización automática con BASE_PRODUCTOS.

V33 usa claves locales b33_* para no heredar datos de prueba de versiones anteriores.

V34 CENTRAL:
- BASE_TECNICOS y BASE_BODEGUEROS como listas maestras en Google Sheets.
- Configuración agrega/desactiva personal directamente en las hojas maestras.
- Los módulos usan el personal recargado desde Sheets.
- Google Sheets es la fuente central; navegador = caché local.
- Soporte Netlify con proxy serverless y variables de entorno.
- deploy-config.js conecta automáticamente /api/bodega en dominios .netlify.app.

V35:
- Mejora visual de modales.
- Se corrigió especialmente la ventana "Agregar producto".
- Sin scroll horizontal extraño.
- Diseño adaptable para PC, tablet y móvil.
- Botones inferiores ordenados y visibles.
- Mejor espaciado y anchura de campos.

V36:
- Se mejoró la visibilidad de todos los campos de entrada.
- Inputs, selects y textareas ahora tienen fondo visible, borde claro y mejor contraste.
- Se aplica a todo el sistema: modales, paneles, filtros, formularios y configuración.
- Mejora de hover, focus, disabled y readonly.

V37 AUDITADA:
- Reparación de autoSync con Proxy Netlify.
- Verificación de guardado directo a Apps Script.
- Guardar Conteo Semanal en Google Sheets ya funciona.
- Validación y sincronización de productos manuales con BASE_PRODUCTOS.
- Reposición automática.
- Evita códigos duplicados.
- Limpieza local segura sin borrar base central.
- Sincronizar todo.
- Diagnóstico del sistema.
- Reintentos de sincronización y recuperación al volver Internet.

V38 PROFESIONAL:
- Mejora visual completa de tablas y formularios.
- Físico y Observación más compactos en Conteo Semanal e Inventario Digital.
- Distribución profesional de selector de familia, búsqueda, filtro, impresión y cierre.
- Códigos, Catálogos y Descripciones largas se ajustan automáticamente.
- Regla global de overflow-wrap/word-break para evitar que textos largos rompan el diseño.
- Tablas responsivas en PC, tablet y móvil.
- Detalles, etiquetas, tarjetas y formularios soportan textos largos.

V39 SALIDA COMPACTA:
- Rediseño de Registrar salida.
- Tarjeta más compacta y profesional.
- Menor altura y mejor alineación de campos.
- Código y Cantidad mejor proporcionados.
- Técnico y Bodeguero en una segunda fila compacta.
- Botón Guardar salida más pequeño y elegante.
- Mantiene compatibilidad con PC y móvil.

V40 RESPONSIVE ANDROID:
- Diseño adaptable para PC, laptop, tablet, Android e iPhone.
- Sidebar tipo drawer en pantallas pequeñas.
- Navegación inferior fija en móvil.
- Formularios a una sola columna en Android.
- Tablas con desplazamiento táctil horizontal.
- Inputs con 16px en móvil para evitar zoom automático.
- Modales tipo bottom sheet.
- Botones más cómodos para uso táctil.
- Ajuste automático de textos largos.

V41 ORDEN MAESTRO:
- El orden del TXT importado se guarda como importOrder.
- Inventario, Inventario Digital, Conteo Semanal, Sin Existencia, búsquedas,
  impresión Digital, CSV y Códigos Nuevos respetan el mismo orden.
- Productos agotados que desaparecen del reporte quedan después del reporte actual.
- Productos manuales se agregan al final.
- Google Sheets > Inventario agrega Orden Importación.

V42 ORDEN INTERNO:
- La tabla visible de Inventario permanece exactamente igual.
- Se eliminó la columna visible Orden Importación de Google Sheets > Inventario.
- El orden del TXT se conserva únicamente como dato interno importOrder.
- Inventario Digital, Conteo Semanal, Sin Existencia, impresión por familia,
  búsquedas y CSV siguen respetando ese orden.

V44 TABLA CORREGIDA:
- Corregido HTML mal formado en inventoryTable.
- Inventario y Productos que requieren atención vuelven a ser tablas reales.
- Colgroup con anchos estables.
- Diseño legible y profesional.
- Compatible con scroll horizontal en Android/tablet.
- Conserva orden interno del TXT sin columna visible.

V46 MENU FIJO CORREGIDO:
- Corrige la doble reserva de ancho que comprimía el contenido en V45.
- Menú lateral fijo en PC.
- Inicio, Inventario y demás pantallas conservan el ancho normal.
- Android/tablet mantienen el drawer responsive.

V47 HISTORIAL DIFERENCIAS:
- Las diferencias ya no desaparecen al importar Inventario.
- Nuevo differenceHistory persistente en localStorage y snapshot central.
- Diferencias muestra Pendientes e Historial.
- Existencia al detectar se conserva aunque luego cambie el Inventario.
- Revisar permite realizar un conteo nuevo.
- Conteo cuadreado marca la diferencia como Resuelta.
- Ajustar Inventario también la marca Resuelta.
- Google Sheets agrega Historial_Diferencias.
- Migración automática de la antigua hoja Diferencias si existe.

V48 DIFERENCIAS SEGURAS:
- Guardado inmediato y confirmado de cada diferencia en Historial_Diferencias.
- Historial_Diferencias deja de ser una hoja sobrescrita por mirrorAll.
- Snapshot vacío ya no puede borrar el historial persistente.
- Importación bloqueada si existen diferencias sin respaldo confirmado.
- Reintento automático cuando vuelve Internet.
- Merge de historial remoto/local para evitar que una descarga antigua borre datos locales.
- Apps Script agrega save_difference y upsert_differences.

V49 HISTORIAL CONTEO SEMANAL:
- Historial permanente por cierre semanal.
- Guardado local primero y respaldo confirmado en Google Sheets.
- Crear siguiente semana bloqueado hasta confirmar el historial anterior.
- Reabrir y volver a cerrar crea una revisión nueva sin alterar cierres anteriores.
- Vista Semana actual / Historial.
- Impresión y CSV de semanas históricas.
- Google Sheets agrega Historial_Semanas e Historial_Conteo_Semanal.
- El detalle histórico congela Existencia, Físico, Diferencia, Estado y Observación.

V50 CORREGIDA:
- Corrige el error archiveCurrentDigitalDifferences is not defined.
- Restaura todas las funciones de Diferencias eliminadas accidentalmente en V49.
- Mantiene Historial permanente de Conteo Semanal.
- Mantiene Diferencias seguras y respaldo inmediato en Google Sheets.

V51 ORDEN PLANTILLA SEMANAL:
- Conteo Semanal respeta exactamente el orden del CSV importado.
- Códigos fuera de Inventario quedan intercalados en su posición real.
- Filtros, impresión, historial y CSV conservan el orden de plantilla.
- La tabla general de Inventario no cambia.

V52 TEXTO UNA LINEA:
- Código, Catálogo y Descripción se muestran completos en una sola línea.
- Sin ellipsis y sin cortes de palabra.
- Las tablas crecen horizontalmente cuando sea necesario.
- Scroll horizontal suave en PC/tablet/Android.
- Aplicado globalmente a los módulos principales.

V53 CONTEO COMPACTO:
- Reduce el espacio entre Familia, Existencia y Físico en Conteo Semanal.
- Campo Físico reducido a 82px en PC y 76px en Android.
- Observación también ligeramente compactada.
- Filas más bajas y limpias.
- Mantiene Código, Catálogo y Descripción completos en una sola línea.
- Mantiene el orden exacto de la plantilla.

V54 INVENTARIO UNA LINEA:
- En Inventario, Código, Catálogo y Descripción quedan forzados a una sola línea real.
- Se muestra todo el texto completo.
- Sin partir palabras y sin puntos suspensivos.
- Se aumentó el ancho profesional de las columnas largas.
- En Android la tabla se desplaza horizontalmente en lugar de romper el texto.

V55 ESPACIOS COMPACTOS:
- Reduce el espacio vacío entre Descripción y Familia en Inventario.
- Descripción usa un ancho base menor, pero continúa mostrando el texto completo en una sola línea.
- Menú fijo de PC reducido de 260px a 218px.
- Contenido principal empieza más cerca del menú.
- Padding lateral del contenido reducido.
- En Android se conserva el drawer táctil y la tabla usa scroll horizontal.


V56 INVENTARIO EXPANDIDO:
- En Inventario, la tabla ahora ocupa mejor el ancho útil del panel.
- Se aumentó un poco el ancho de Código, Catálogo y Descripción.
- Se redujo el espacio vacío a la derecha.
- Se mantiene una sola línea, sin partir texto y sin usar puntos suspensivos.
- En Android sigue funcionando con desplazamiento horizontal.

V57 NETLIFY READY:
- Acc. y Código fijos en Inventario para tablet/celular.
- Estructura Netlify separada: public/ + netlify/functions/.
- Proxy seguro para Apps Script.
- Variables BODEGA_APPS_SCRIPT_URL y BODEGA_API_TOKEN fuera del navegador.
- netlify.toml listo para publicar public/ y Functions.
