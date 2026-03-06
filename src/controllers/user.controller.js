import {asyncHandler} from "../utils/asyncHandler.js"

const register = asyncHandler( async (res,req) => {
    res.status(200).json({
        message : "ok"
    })
} )