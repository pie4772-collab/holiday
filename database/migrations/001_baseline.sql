-- 기준선: 이 시점까지의 스키마는 database/schema.sql 과 server/db.js migrate() 가 관리한다.
-- 이후 스키마 변경은 002_설명.sql 부터 추가한다.
--   - 파일은 번호 순서대로 한 번만 적용되고, 적용 기록은 schema_migrations 테이블에 남는다.
--   - 파일마다 트랜잭션으로 감싸 실행하므로 BEGIN/COMMIT 을 쓰지 않는다.
--   - 이미 배포된 파일은 수정하지 말고 새 번호로 추가한다.
SELECT 1;
