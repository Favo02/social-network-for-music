import express from "express"
import REGEX from "../utils/regex.js"
import authenticateUser from "../middlewares/authenticateUser.js"
import Playlist from "../models/Playlist.js"
import User from "../models/User.js"

const playlistsRouter = express.Router()

/**
 * Get all playlists followed, created or collaborated by current user
 * @requires authorization header (JWT token)
 * @returns {Response}
 */
playlistsRouter.get("/", authenticateUser, async (req, res) => {
  /*
    #swagger.tags = ["Playlists"]
    #swagger.summary = "Get all playlists followed, created or collaborated by current user (AUTH required)"
  */

  const user = await User.findById(req.user.id).populate("playlists.id")

  // "normalize" population
  const playlists = user.playlists.map(p => ({
    ...p.id._doc,
    isCreator: p.isCreator,
    isCollaborator: p.isCollaborator
  }))

  res.json(playlists)
})


/**
 * Get details of a single playlist
 * @requires authorization header (JWT token)
 * @returns {Response}
 */
playlistsRouter.get("/:id", authenticateUser, async (req, res) => {
  /*
    #swagger.tags = ["Playlists"]
    #swagger.summary = "Get details of {id} playlist (AUTH required)"
  */

  const playlist = await Playlist.findById(req.params.id)

  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" })
  }

  // if not public check user is creator/collaborator
  if (!playlist.isPublic) {
    const userInFollowers = playlist.followers.find(f => f.id === req.user.id)
    if (!userInFollowers) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    if (!(userInFollowers.isCreator || userInFollowers.isCollaborator)) {
      return res.status(401).json({ error: "Unauthorized" })
    }
  }

  res.json(playlist)
})

/**
 * Get all public playlists metadata
 * @returns {Response}
 */
playlistsRouter.get("/public", async (req, res) => {
  /*
    #swagger.tags = ["Playlists"]
    #swagger.summary = "Get all public playlists metadata"
  */

  const playlists = await Playlist
    .find({ isPublic: true })
    .map(p => ({
      title: p.title,
      description: p.description,
      tags: p.tags,
      tracksNumber: p.tracks.length,
      followersNumber: p.followers.length
    }))

  res.json(playlists)
})

/**
 * Create new playlist
 * @param {Playlist} body playlist to add
 * @requires authorization header (JWT token)
 * @returns {Response}
 */
playlistsRouter.post("/create", authenticateUser, async (req, res) => {
  /*
    #swagger.tags = ["Playlists"]
    #swagger.summary = "Create new playlist (AUTH required)"
  */

  const {
    title,
    description,
    tags,
    isPublic
  } = req.body

  // fields validation
  if (!title || !REGEX.title.test(title)) {
    return res.status(400).json({ error: `Enter a valid title: ${REGEX.titleDesc}` })
  }
  if (!description || !REGEX.description.test(description)) {
    return res.status(400).json({ error: `Enter a valid description: ${REGEX.descriptionDesc}` })
  }
  if (tags && Array.isArray(tags)) { // tags can be empty
    tags.forEach(t => {
      if (!t || !REGEX.tag.test(t)) {
        return res.status(400).json({ error: `Enter a valid tag: ${REGEX.tagDesc}` })
      }
    })
  }

  const playlist = {
    title: title,
    description: description,
    tags: tags,
    isPublic: isPublic ?? false,
    followers: [{
      userId: req.user.id,
      isCreator: true
    }]
  }

  const newPlaylist = new Playlist(playlist)
  const savedPlaylist = await newPlaylist.save()

  const user = await User.findById(req.user.id)
  user.playlists.push({ id: newPlaylist._id, isCreator: true })
  await user.save()

  res.status(201).json(savedPlaylist)
})

/**
 * Edit @param id playlist
 * @param {String} id id of playlist to edit
 * @param {User} body fields of the playlist to edit
 * @requires authorization header (JWT token)
 * @returns {Response}
 */
playlistsRouter.patch("/edit/:id", authenticateUser, async (req, res) => {
  /*
    #swagger.tags = ["Playlists"]
    #swagger.summary = "Edit id playlist (AUTH required)"
  */

  const playlist = await Playlist.findById(req.params.id)

  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" })
  }

  // check user is creator/collaborator
  const userInFollowers = playlist.followers.find(f => f.id === req.user.id)
  if (!userInFollowers) {
    return res.status(401).json({ error: "You need to be the creator or a collaborator to edit this playlist" })
  }
  if (!(userInFollowers.isCreator || userInFollowers.isCollaborator)) {
    return res.status(401).json({ error: "You need to ne the creator or a collaborator to edit this playlist" })
  }

  // title
  if (req.body?.title) {
    const title = req.body.title

    if (!REGEX.title.test(title)) {
      return res.status(400).json({ error: `Enter a valid title: ${REGEX.titleDesc}` })
    }

    playlist.title = title
  }

  // description
  if (req.body?.description) {
    const description = req.body.description

    if (!REGEX.description.test(description)) {
      return res.status(400).json({ error: `Enter a valid description: ${REGEX.description}` })
    }

    playlist.description = description
  }

  // tags
  if (req.body?.tags) {
    const tags = req.body.tags

    if (Array.isArray(tags)) {
      tags.forEach(t => {
        if (!t || !REGEX.tag.test(t)) {
          return res.status(400).json({ error: `Enter a valid tag: ${REGEX.tagDesc}` })
        }
      })
    }

    playlist.tags = tags
  }

  // isPublic
  if("isPublic" in req.body) {
    playlist.isPublic = req.body.isPublic
  }

  const updatedPlaylist = await playlist.save()
  res.status(200).json(updatedPlaylist)
})

/**
 * Delete @param id playlist
 * @param {String} id id of playlist to edit
 * @requires authorization header (JWT token)
 * @returns {Response}
 */
playlistsRouter.delete("/delete/:id", authenticateUser, async (req, res) => {
  /*
    #swagger.tags = ["Playlists"]
    #swagger.summary = "Delete id playlist (AUTH required)"
  */

  const playlist = await Playlist.findById(req.params.id)

  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" })
  }

  // check user is creator/collaborator
  const userInFollowers = playlist.followers.find(f => f.id === req.user.id)
  if (!userInFollowers) {
    return res.status(401).json({ error: "You need to be the creator to delete this playlist" })
  }
  if (!(userInFollowers.isCreator)) {
    return res.status(401).json({ error: "You need to be the creator to delete this playlist" })
  }

  // TODO: update all followers

  await Playlist.findByIdAndDelete(req.params.id)

  res.status(204).end()
})

export default playlistsRouter
