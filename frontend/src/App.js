// App.jsx
// Frontend for the Pet Management System assignment.
// Full CRUD for pets (name, breed, age, owner, photo) with:
//   - image preview before upload
//   - filter by breed (bonus feature) + a name/owner search
//   - loading states on fetch, submit, and delete
//   - toast notifications for every action
//   - responsive card-based UI

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button, InputGroup, OverlayToaster, Spinner, HTMLSelect, Icon } from '@blueprintjs/core';
import './App.css';

// Base URL of the Express backend's API
const API_URL = 'http://localhost:5000/api/pets';
// Base URL used to build full image URLs (backend serves /uploads statically)
const SERVER_URL = 'http://localhost:5000';

// ---------- TOASTER SETUP ----------
// OverlayToaster.createAsync() returns a Promise, so we store the resolved instance
// once ready, and guard every .show() call in case it fires before setup finishes.
let AppToaster = null;
OverlayToaster.createAsync({ position: 'top' }).then((toaster) => {
    AppToaster = toaster;
});

function showToast(message, intent) {
    if (AppToaster) {
        AppToaster.show({ message, intent, timeout: 3000 });
    }
}

// The empty shape of the form, reused whenever we reset it
const emptyForm = { petName: '', breed: '', age: '', ownerName: '' };

function App() {
    // ---------- STATE ----------

    // Full list of pets fetched from the backend (unfiltered — filtering happens client-side)
    const [pets, setPets] = useState([]);

    // All form fields grouped into a single object, since there are now four text/number fields
    const [form, setForm] = useState(emptyForm);

    // The actual File object chosen by the user (needed to send via FormData)
    const [selectedFile, setSelectedFile] = useState(null);

    // Local preview URL, shown before the photo is ever uploaded
    const [previewUrl, setPreviewUrl] = useState(null);

    // If not null, we're editing that pet's id; otherwise we're adding a new pet
    const [editingId, setEditingId] = useState(null);

    // Loading flags — kept separate so each part of the UI can show its own feedback
    const [isFetching, setIsFetching] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // Filter/search state (bonus feature: filter by breed, plus a free-text search)
    const [breedFilter, setBreedFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Reference to the actual file input DOM element, so we can clear it manually after submit
    const fileInputRef = useRef(null);

    // ---------- DATA FETCHING (READ) ----------

    function fetchPets() {
        setIsFetching(true);
        fetch(API_URL)
            .then((res) => res.json())
            .then((data) => setPets(data))
            .catch(() => showToast('Failed to load pets', 'danger'))
            .finally(() => setIsFetching(false));
    }

    // Load the pet list once, when the component first mounts
    useEffect(() => {
        fetchPets();
    }, []);

    // ---------- DERIVED DATA ----------

    // List of unique breeds currently in the data, used to populate the filter dropdown.
    // Recomputed only when the pets list changes (useMemo avoids recalculating on every render).
    const breedOptions = useMemo(() => {
        const uniqueBreeds = [...new Set(pets.map((p) => p.breed))].sort();
        return ['all', ...uniqueBreeds];
    }, [pets]);

    // The actual list rendered on screen: pets filtered by breed AND the search term.
    // Both filters are applied client-side, combined together.
    const visiblePets = useMemo(() => {
        return pets.filter((pet) => {
            const matchesBreed = breedFilter === 'all' || pet.breed === breedFilter;
            const matchesSearch =
                searchTerm.trim() === '' ||
                pet.petName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                pet.ownerName.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesBreed && matchesSearch;
        });
    }, [pets, breedFilter, searchTerm]);

    // Small header stats (total pets, unique breeds, unique owners) — purely derived,
    // recalculated only when the underlying pets list changes.
    const stats = useMemo(() => {
        const uniqueBreeds = new Set(pets.map((p) => p.breed)).size;
        const uniqueOwners = new Set(pets.map((p) => p.ownerName)).size;
        return { total: pets.length, breeds: uniqueBreeds, owners: uniqueOwners };
    }, [pets]);

    // Assigns one of a small set of pastel colors to a breed badge, based on the breed
    // name itself — so the same breed always gets the same color, and colors vary nicely
    // across a list without needing per-breed configuration.
    function breedColorClass(breed) {
        const palette = ['badge-a', 'badge-b', 'badge-c', 'badge-d', 'badge-e'];
        let hash = 0;
        for (let i = 0; i < breed.length; i++) hash = breed.charCodeAt(i) + ((hash << 5) - hash);
        return palette[Math.abs(hash) % palette.length];
    }

    // ---------- FORM HANDLING ----------

    // Generic change handler for the four text/number inputs — uses the input's "name"
    // attribute to know which field in the form object to update.
    function handleFieldChange(event) {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    }

    // Runs when the user selects a photo in the file input
    function handleFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file', 'warning');
            return;
        }

        setSelectedFile(file);
        // Creates a temporary local browser URL pointing at the file on disk —
        // this powers the "preview before upload" feature.
        setPreviewUrl(URL.createObjectURL(file));
    }

    // Clears the form back to its empty/default state
    function resetForm() {
        setForm(emptyForm);
        setSelectedFile(null);
        setPreviewUrl(null);
        setEditingId(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }

    // Populates the form with an existing pet's data, ready for editing
    function startEdit(pet) {
        setEditingId(pet.id);
        setForm({
            petName: pet.petName,
            breed: pet.breed,
            age: String(pet.age),
            ownerName: pet.ownerName
        });
        setSelectedFile(null); // No new photo chosen yet — existing one may be kept
        setPreviewUrl(`${SERVER_URL}${pet.imageUrl}`); // Preview shows the CURRENT photo
        // Scroll the form into view — handy on mobile where the list may be long
        document.querySelector('.pet-form')?.scrollIntoView({ behavior: 'smooth' });
    }

    // Client-side validation, mirroring the rules enforced on the backend
    function validateForm() {
        if (!form.petName.trim()) return 'Pet name is required';
        if (!form.breed.trim()) return 'Breed is required';
        if (!form.ownerName.trim()) return 'Owner name is required';
        if (form.age === '' || isNaN(Number(form.age)) || Number(form.age) < 0) {
            return 'Age must be a valid non-negative number';
        }
        if (!editingId && !selectedFile) return 'Please select a pet photo';
        return null; // No errors
    }

    // Handles submitting the form — covers both "create" and "update"
    function handleSubmit(event) {
        event.preventDefault();

        const validationError = validateForm();
        if (validationError) {
            showToast(validationError, 'warning');
            return;
        }

        // FormData is required because we're sending a binary file alongside text fields
        const formData = new FormData();
        formData.append('petName', form.petName.trim());
        formData.append('breed', form.breed.trim());
        formData.append('age', form.age);
        formData.append('ownerName', form.ownerName.trim());
        if (selectedFile) {
            formData.append('image', selectedFile); // Only attach if a new photo was chosen
        }

        setIsSubmitting(true);

        const url = editingId ? `${API_URL}/${editingId}` : API_URL;
        const method = editingId ? 'PUT' : 'POST';

        fetch(url, {
            method,
            body: formData
            // No manual Content-Type header — the browser sets the correct multipart
            // boundary automatically when the body is a FormData object.
        })
            .then(async (res) => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Request failed');
                }
                return res.json();
            })
            .then(() => {
                showToast(
                    editingId ? 'Pet updated successfully' : 'Pet added successfully',
                    'success'
                );
                resetForm();
                fetchPets();
            })
            .catch((err) => {
                showToast(err.message || 'Something went wrong', 'danger');
            })
            .finally(() => setIsSubmitting(false));
    }

    // ---------- DELETE ----------

    function handleDelete(pet) {
        // Simple confirmation to avoid accidental deletes
        const confirmed = window.confirm(`Delete ${pet.petName}? This cannot be undone.`);
        if (!confirmed) return;

        setDeletingId(pet.id);

        fetch(`${API_URL}/${pet.id}`, { method: 'DELETE' })
            .then((res) => {
                if (!res.ok) throw new Error('Request failed');
                return res.json();
            })
            .then(() => {
                showToast('Pet deleted successfully', 'danger');
                setPets((prev) => prev.filter((p) => p.id !== pet.id));
            })
            .catch(() => showToast('Failed to delete pet', 'danger'))
            .finally(() => setDeletingId(null));
    }

    // ---------- RENDER ----------

    return (
        <div className="App">
            {/* ---------- HEADER ---------- */}
            <header className="app-header">
                <div className="header-content">
                    <div className="brand">
                        <span className="brand-icon"><Icon icon="walk" size={22} /></span>
                        <div>
                            <h1>Pet Management</h1>
                            <p className="subtitle">Every pet, breed, and owner — in one gentle place</p>
                        </div>
                    </div>
                    <div className="stats-row">
                        <div className="stat-pill">
                            <span className="stat-number">{stats.total}</span>
                            <span className="stat-label">Pets</span>
                        </div>
                        <div className="stat-pill">
                            <span className="stat-number">{stats.breeds}</span>
                            <span className="stat-label">Breeds</span>
                        </div>
                        <div className="stat-pill">
                            <span className="stat-number">{stats.owners}</span>
                            <span className="stat-label">Owners</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="layout">
                {/* ---------- ADD / EDIT FORM (left column) ---------- */}
                <form className="pet-form" onSubmit={handleSubmit}>
                    <h2>{editingId ? 'Edit Pet' : 'Add New Pet'}</h2>

                    <label className="field-label">Pet Name</label>
                    <InputGroup
                        name="petName"
                        value={form.petName}
                        onChange={handleFieldChange}
                        placeholder="e.g. Buddy"
                    />

                    <label className="field-label">Breed</label>
                    <InputGroup
                        name="breed"
                        value={form.breed}
                        onChange={handleFieldChange}
                        placeholder="e.g. Golden Retriever"
                    />

                    <label className="field-label">Age (years)</label>
                    <InputGroup
                        name="age"
                        type="number"
                        min="0"
                        value={form.age}
                        onChange={handleFieldChange}
                        placeholder="e.g. 3"
                    />

                    <label className="field-label">Owner Name</label>
                    <InputGroup
                        name="ownerName"
                        value={form.ownerName}
                        onChange={handleFieldChange}
                        placeholder="e.g. Alex Johnson"
                    />

                    <label className="field-label">Pet Photo</label>
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="file-input"
                    />

                    {/* Live preview: shown once a photo is chosen, or the existing photo when editing */}
                    {previewUrl && (
                        <div className="image-preview">
                            <img src={previewUrl} alt="Preview" />
                        </div>
                    )}

                    <div className="form-actions">
                        <Button type="submit" className="btn-pill btn-primary-pill" large disabled={isSubmitting} fill>
                            {isSubmitting ? <Spinner size={16} /> : editingId ? 'Update Pet' : 'Add Pet 🐾'}
                        </Button>

                        {editingId && (
                            <Button type="button" className="btn-pill btn-ghost-pill" onClick={resetForm} disabled={isSubmitting} large>
                                Cancel
                            </Button>
                        )}
                    </div>
                </form>

                {/* ---------- PET LIST (right column) ---------- */}
                <div className="pet-list-section">
                    {/* ---------- FILTER BAR (bonus: filter by breed, plus search) ---------- */}
                    <div className="filter-bar">
                        <InputGroup
                            leftIcon="search"
                            placeholder="Search by pet or owner name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                        <HTMLSelect
                            value={breedFilter}
                            onChange={(e) => setBreedFilter(e.target.value)}
                        >
                            {breedOptions.map((breed) => (
                                <option key={breed} value={breed}>
                                    {breed === 'all' ? 'All breeds' : breed}
                                </option>
                            ))}
                        </HTMLSelect>
                    </div>

                    {isFetching ? (
                        <div className="center-message"><Spinner /></div>
                    ) : visiblePets.length === 0 ? (
                        <div className="center-message">
                            <Icon icon="search" size={32} />
                            <p>
                                {pets.length === 0
                                    ? 'No pets yet — add your first one on the left.'
                                    : 'No pets match your current search or filter.'}
                            </p>
                        </div>
                    ) : (
                        <div className="pet-grid">
                            {visiblePets.map((pet) => (
                                <div className="pet-card" key={pet.id}>
                                    <img
                                        src={`${SERVER_URL}${pet.imageUrl}`}
                                        alt={pet.petName}
                                        className="pet-photo"
                                    />
                                    <div className="pet-card-body">
                                        <h3>{pet.petName}</h3>
                                        <span className={`breed-badge ${breedColorClass(pet.breed)}`}>{pet.breed}</span>
                                        <p className="pet-meta">🎂 {pet.age} {pet.age === 1 ? 'year' : 'years'}</p>
                                        <p className="pet-meta">👤 {pet.ownerName}</p>
                                        <div className="card-actions">
                                            <Button className="btn-pill btn-edit-pill" onClick={() => startEdit(pet)} small>
                                                Edit
                                            </Button>
                                            <Button
                                                className="btn-pill btn-delete-pill"
                                                onClick={() => handleDelete(pet)}
                                                disabled={deletingId === pet.id}
                                                small
                                            >
                                                {deletingId === pet.id ? <Spinner size={14} /> : 'Delete'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
