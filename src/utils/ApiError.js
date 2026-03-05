class ApiError extends Error{
    constructor(
        statuscode,
        message = "something went wrong",
        errors = [],
    ){
        super(message)
        this.statuscode = statuscode
        this.errors = errors
        this.data = null
        this.success = false
        this.message = message
    }
}
export {ApiError}