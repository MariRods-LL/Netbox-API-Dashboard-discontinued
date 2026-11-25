let progress = {
    running:false,
    percentage:0,
    stage:"",
    message:""

};

function updateProgress(data){

    progress = {
        ...progress,
        ...data

    };

}

function getProgress(){
    return progress;

}

function resetProgress(){
    progress = {

        running:false,
        percentage:0,
        stage:"",
        message:""

    };

}

module.exports = {

    updateProgress,
    getProgress,
    resetProgress

};