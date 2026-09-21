using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BackendApi.Migrations
{
    /// <inheritdoc />
    public partial class AddUniversitiesAndCommunity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "UniversityId",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UniversityCourseId",
                table: "Subjects",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ContentUpdatedAt",
                table: "Lessons",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            // ContentUpdatedAt is new and non-nullable; give existing rows a
            // sensible value (rather than the 0001-01-01 default above) by
            // backdating it to when the lesson itself was created.
            migrationBuilder.Sql("UPDATE Lessons SET ContentUpdatedAt = CreatedAt");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ForkSyncedAt",
                table: "Lessons",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ForkedFromAuthorName",
                table: "Lessons",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ForkedFromLessonId",
                table: "Lessons",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsShared",
                table: "Lessons",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "LikeCount",
                table: "Lessons",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SharedAt",
                table: "Lessons",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CourseProposals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniversityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SubjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    CourseId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    AppliedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CourseProposals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CourseProposals_Subjects_SubjectId",
                        column: x => x.SubjectId,
                        principalTable: "Subjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LessonLikes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    LessonId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LessonLikes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LessonLikes_Lessons_LessonId",
                        column: x => x.LessonId,
                        principalTable: "Lessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Universities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ShortName = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Universities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UniversityCourses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniversityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Code = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UniversityCourses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UniversityCourses_Universities_UniversityId",
                        column: x => x.UniversityId,
                        principalTable: "Universities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_UniversityId",
                table: "Users",
                column: "UniversityId");

            migrationBuilder.CreateIndex(
                name: "IX_Subjects_UniversityCourseId",
                table: "Subjects",
                column: "UniversityCourseId");

            migrationBuilder.CreateIndex(
                name: "IX_Subjects_UserId_UniversityCourseId",
                table: "Subjects",
                columns: new[] { "UserId", "UniversityCourseId" },
                unique: true,
                filter: "\"UniversityCourseId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CourseProposals_SubjectId",
                table: "CourseProposals",
                column: "SubjectId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LessonLikes_LessonId_UserId",
                table: "LessonLikes",
                columns: new[] { "LessonId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Universities_Name",
                table: "Universities",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UniversityCourses_UniversityId",
                table: "UniversityCourses",
                column: "UniversityId");

            migrationBuilder.AddForeignKey(
                name: "FK_Subjects_UniversityCourses_UniversityCourseId",
                table: "Subjects",
                column: "UniversityCourseId",
                principalTable: "UniversityCourses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Universities_UniversityId",
                table: "Users",
                column: "UniversityId",
                principalTable: "Universities",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Subjects_UniversityCourses_UniversityCourseId",
                table: "Subjects");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Universities_UniversityId",
                table: "Users");

            migrationBuilder.DropTable(
                name: "CourseProposals");

            migrationBuilder.DropTable(
                name: "LessonLikes");

            migrationBuilder.DropTable(
                name: "UniversityCourses");

            migrationBuilder.DropTable(
                name: "Universities");

            migrationBuilder.DropIndex(
                name: "IX_Users_UniversityId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Subjects_UniversityCourseId",
                table: "Subjects");

            migrationBuilder.DropIndex(
                name: "IX_Subjects_UserId_UniversityCourseId",
                table: "Subjects");

            migrationBuilder.DropColumn(
                name: "UniversityId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UniversityCourseId",
                table: "Subjects");

            migrationBuilder.DropColumn(
                name: "ContentUpdatedAt",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "ForkSyncedAt",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "ForkedFromAuthorName",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "ForkedFromLessonId",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "IsShared",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "LikeCount",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "SharedAt",
                table: "Lessons");
        }
    }
}
