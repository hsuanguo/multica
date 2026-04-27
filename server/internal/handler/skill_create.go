package handler

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type skillCreateInput struct {
	WorkspaceID    string
	CreatorID      string
	Name           string
	Description    string
	Content        string
	Config         any
	Files          []CreateSkillFileRequest
	Source         string
	SourceMetadata []byte
	SyncedAt       *time.Time
}

func (h *Handler) createSkillWithFiles(ctx context.Context, input skillCreateInput) (SkillWithFilesResponse, error) {
	input.Name = sanitizeSkillTextForPostgres(input.Name)
	input.Description = sanitizeSkillTextForPostgres(input.Description)
	input.Content = sanitizeSkillTextForPostgres(input.Content)
	for i := range input.Files {
		input.Files[i].Path = sanitizeSkillTextForPostgres(input.Files[i].Path)
		input.Files[i].Content = sanitizeSkillTextForPostgres(input.Files[i].Content)
	}

	config, err := json.Marshal(input.Config)
	if err != nil {
		return SkillWithFilesResponse{}, err
	}
	if input.Config == nil {
		config = []byte("{}")
	}

	source := input.Source
	if source == "" {
		source = "manual"
	}
	meta := input.SourceMetadata
	if len(meta) == 0 {
		meta = []byte("{}")
	}
	syncedAt := pgtype.Timestamptz{Valid: false}
	if input.SyncedAt != nil {
		syncedAt = pgtype.Timestamptz{Time: *input.SyncedAt, Valid: true}
	}

	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		return SkillWithFilesResponse{}, err
	}
	defer tx.Rollback(ctx)

	qtx := h.Queries.WithTx(tx)

	skill, err := qtx.CreateSkill(ctx, db.CreateSkillParams{
		WorkspaceID:    parseUUID(input.WorkspaceID),
		Name:           input.Name,
		Description:    input.Description,
		Content:        input.Content,
		Config:         config,
		CreatedBy:      parseUUID(input.CreatorID),
		Source:         source,
		SourceMetadata: meta,
		SyncedAt:       syncedAt,
	})
	if err != nil {
		return SkillWithFilesResponse{}, err
	}

	fileResps := make([]SkillFileResponse, 0, len(input.Files))
	for _, f := range input.Files {
		sf, err := qtx.UpsertSkillFile(ctx, db.UpsertSkillFileParams{
			SkillID: skill.ID,
			Path:    f.Path,
			Content: f.Content,
		})
		if err != nil {
			return SkillWithFilesResponse{}, err
		}
		fileResps = append(fileResps, skillFileToResponse(sf))
	}

	if err := tx.Commit(ctx); err != nil {
		return SkillWithFilesResponse{}, err
	}

	return SkillWithFilesResponse{
		SkillResponse: skillToResponse(skill),
		Files:         fileResps,
	}, nil
}
