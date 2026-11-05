-- 직위(부장·차장·과장·대리·사원)와 급호(급 1급갑~5급, 호봉 1~14). 결재에 쓰는 직급(position)과 별개입니다.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_rank TEXT COLLATE "C";
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_grade TEXT COLLATE "C";
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_step INTEGER;
