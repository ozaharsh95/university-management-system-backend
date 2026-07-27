DROP INDEX "enrollments_student_class_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_student_class_unique" ON "enrollments" USING btree ("student_id","class_id");