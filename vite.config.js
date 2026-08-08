import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages 배포 경로: https://piazzasanpietro.github.io/sea-of-the-pen/
// 로컬 개발에서는 base가 '/'여도 무방하지만, 배포와 동일 경로로 맞춰 경로 버그를 미리 드러낸다.
export default defineConfig({
  base: '/sea-of-the-pen/',
  server: { port: 5210, open: false },
  build: {
    outDir: 'dist',
    target: 'es2020',
    emptyOutDir: true,
    rollupOptions: {
      // 두 진입점: index.html(엔지니어링 하니스) · draw.html(배 그리기 화면).
      // archive/ 의 레거시 프로토타입은 여기 없으므로 여전히 빌드 대상이 아니다.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        draw: fileURLToPath(new URL('./draw.html', import.meta.url)),
      },
    },
  },
});
