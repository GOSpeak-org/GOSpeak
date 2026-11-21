package signal

import (
	"GOSpeak/internal/model"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type fakeLayoutStore struct {
	groups []model.DomainRoomGroup
	layout model.DomainRoomLayout
}

func (f *fakeLayoutStore) Groups(domainUUID string) ([]model.DomainRoomGroup, error) {
	return f.groups, nil
}
func (f *fakeLayoutStore) Layout(domainUUID string) (model.DomainRoomLayout, error) {
	return f.layout, nil
}

type fakeRoomStore struct {
	rooms []model.Room
}

func (f *fakeRoomStore) List(page, pageSize int, roomType, domainUUID string) ([]model.Room, int64, error) {
	return f.rooms, int64(len(f.rooms)), nil
}
func (f *fakeRoomStore) GetByName(name string) (*model.Room, error) { return nil, nil }
func (f *fakeRoomStore) GetByDomainAndName(domainUUID, name string) (*model.Room, error) {
	return nil, nil
}

func TestHubRoomListLayoutOrder(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Room{}); err != nil {
		t.Fatal(err)
	}
	rooms := []model.Room{
		{UUID: "room-a", Name: "a", DomainUUID: "dom1", GroupUUID: "group-1", SortOrder: 0},
		{UUID: "room-b", Name: "b", DomainUUID: "dom1", GroupUUID: "group-1", SortOrder: 1},
		{UUID: "room-c", Name: "c", DomainUUID: "dom1", SortOrder: 0},
	}
	db.Create(&rooms)

	store := &fakeRoomStore{rooms: rooms}
	layoutStore := &fakeLayoutStore{
		groups: []model.DomainRoomGroup{{UUID: "group-1", Name: "常用", SortOrder: 0}},
		layout: model.DomainRoomLayout{DomainUUID: "dom1", UngroupedPosition: 0},
	}
	h := NewHubWithOptions(store, nil, nil, nil, HubOptions{LayoutStore: layoutStore})

	got := h.getMergedRooms("dom1")
	if len(got) != 3 {
		t.Fatalf("expected 3 rooms, got %d", len(got))
	}
	want := []string{"room-c", "room-a", "room-b"}
	for i, uuid := range want {
		if got[i].UUID != uuid {
			t.Fatalf("position %d: got %s, want %s (all: %+v)", i, got[i].UUID, uuid, got)
		}
	}
	if got[1].GroupUUID != "group-1" || got[1].SortOrder != 0 {
		t.Fatalf("room-a lost group fields: %+v", got[1])
	}
}
