import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import User from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponce } from "../utils/ApiResponce.js"
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave : false})

        return {accessToken,refreshToken}
        
    } catch (error) {
        return new ApiError(500,"Something went wrong while generating access and refresh token")
    }

}


const register = asyncHandler( async (res,req) => {
    const {username,fullname,email,password} = req.body

    if(
        [username,fullname,email,password].some((field) => field?.trim() ==="" )
    ){
        throw new ApiError(400,"All fields are required")
    }

    const existedUser = User.findOne({
        $or : [{ username }, { email }]
    })

    if(existedUser){
        throw new ApiError(409,"User with email and username is already existed")
    }
    
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.path

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required")
    }
    
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    
    if(!avatar){
        throw new ApiError(400,"Avatar is required")
    }

    const user = await User.create({
        fullname,
        avatar : avatar.url,
        coverImage : coverImage?.url,
        email,
        password,
        username : username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser){
        throw new ApiError(500,"something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponce(200,createdUser,"User register successfully")
    )
} )

const userLogin = asyncHandler( async (res,req) => {
    const {username,email,password} = req.body

    if(!(username || email)){
        return new ApiError(400,"username or email is required")
    }

    const user = await User.findOne({
        $or : [{ username },{ email }]
    })
    
    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        return new ApiError(404,"Invalid user credentials")
    }
    
    
    const {refreshToken,accessToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly : true,
        secure : true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponce(
            200,
            {
              user :  refreshToken,accessToken,loggedInUser
            },
            "user logged in successfully"
        )
    )



})

const logoutUser = asyncHandler( async (res,req) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set : {
                refreshToken : undefined
            }
        },
        {
            new : true
        }
    )

     const options = {
        httpOnly : true,
        secure : true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json( new ApiResponce(200),{},"User logged out")


})

const refreshAccessToken = asyncHandler( async (req,res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken

    if(incomingRefreshToken){
        throw new ApiError(401,"Unauthorized request")
    }
    
    try {
        const decodedToken = jwt.varify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        
        const user = User.findById(decodedToken?._id)
        
        if(!user){
            throw new ApiError(401,"Invalid Refresh Token ")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Reresh Token is used or expired")
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
    
         const {accessToken,newRefreshToken} = await generateAccessAndRefreshToken(user._id)
    
         return res
         .cookie("accessToken",accessToken,options)
         .cookie("refreshToken",newRefreshToken,options)
         .json(
            new ApiResponce(
                200,
                {accessToken,refreshToken : newRefreshToken},
                "Access Token Refreshed"
            )
         )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid Refresh Token")
    }
})

const changeCurrentPassword = asyncHandler( async (req,res) => {
    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(401,"Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(
        new ApiResponce(200,{},"Password Changed successfully")
    )
})

const getCurrentUser = asyncHandler( async (req,res) => {
    return res
    .status(200)
    .json(200, req.user, "current user fetched successfully")
})

const updateAccountDetails = asyncHandler( async (req,res) => {
    const {fullname , email} = req.body

    if(!fullname || !email){
        throw new ApiError(400,"All field are required")
    }

    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                fullname,
                email : email
            }
        },
        {
            new : true
        }
    ).select("-password")
    
    return res
    .status(200)
    .json(
        new ApiResponce(200,user,"Account Details updated successfully")
    )
})

const updateAvatarDetails = asyncHandler( async (req,res) => {
    const avatarLocalPath = req.file?.path()

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is missing")
    }
    
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    
    if(!avatar.url){
        throw new ApiError(400,"Error while uploading on Avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                avatar = avatar.url
            }
        },
        {
            new : true
        }
    ).select("-password")

    return res
    .status(200)
    .json(200,"Avatar image updated")
})

const updateCoverImageDetails = asyncHandler( async (req,res) => {
    const coverImageLocalPath = req.file?.path()

    if(!coverImageLocalPath){
        throw new ApiError(400,"CoverImage is missing")
    }
    
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    
    if(!coverImage.url){
        throw new ApiError(400,"Error while uploading on coverImage")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                coverImage : coverImage.url
            }
        },
        {
            new : true
        }
    ).select("-password")

    return res
    .status(200)
    .json(200,"Cover image updated")
})


export
{
    register,
    userLogin,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateAvatarDetails,
    updateCoverImageDetails
}