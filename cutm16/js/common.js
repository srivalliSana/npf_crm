/** Start JS for Banner section **/

(function ($) {
    "use strict";
    $(document).ready(function () {
		// Main banner
		$("#main-banner").owlCarousel({
			autoplay:true,
		  autoplayHoverPause:true,
			items : 1,
			animateOut: 'fadeOut',
			animateIn: 'fadeIn',
			nav:true,
			loop:true,
			navText: [
			  "<i class='fa fa-angle-left'></i>",
			  "<i class='fa fa-angle-right'></i>"
			  ]
        });
		$('#mainBanner').bind('mouseover', function (e){
			$('#mainBanner').trigger('stop.owl.autoplay');
		});

		$('#mainBanner').bind('mouseleave', function (e){
			 $('#mainBanner').trigger('play.owl.autoplay');
		});	
   });  	
})(jQuery);

/** End JS for Banner section **/

/* Start page loader js */

jQuery(window).load(function(){ 
	jQuery('.pageloader').fadeOut();
  })

/* End page loader js */

/* Start js for change text color when focus on input field */
 $('input').each(function(){

    $(this).focus(function(){
      $(this).addClass('input-focus');
    });

    $(this).blur(function(){
      $(this).removeClass('input-focus');
    });

  });
 /* End js for change text color when focus on input field */

/** Link Change JS ***/
(function($) {
  
  "use strict";  
  
  jQuery('.desktop_withoutpopup').append(jQuery('<div class="text-center center-link"><a href="#tab2default" data-toggle="tab" aria-expanded="false">Already have an Account? Login</a></div>'));
jQuery('#tab2default .agree-group.fpass').append(jQuery('<a class="registerYet" href="#tab1default" data-toggle="tab" aria-expanded="true">Click here to Register </a>'));
    
}(jQuery));

jQuery(window).load(function () {
  $('#tab1default > div > a').text("Already have an Account? Login");
  $('#registerBtn').html('<span class="apply_now">REGISTER</span>');
  $('#loginBtn').html('<span class="apply_now">LOGIN</span>');
  $('#resendVlinkBtn').html('<span class="apply_now">SUBMIT</span>');
  $('#forgotBtn').html('<span class="apply_now">SUBMIT</span>');
  $('#forgotOtpBtn').html('<span class="apply_now">SUBMIT</span>');
});

/** End Link Change JS **/

/** Start JS for input Icons **/
$(".icon-class .reg_name_div").prepend('<i class="field-icon icon-name"></i>');
$(".icon-class .reg_email_div").prepend('<i class="field-icon icon-Email"></i>');
$(".icon-class .merge_field_div").prepend('<i class="field-icon icon-phone"></i>');
$(".icon-class .reg_password_div").prepend('<i class="field-icon icon-password"></i>');
$(".icon-class .OTP").prepend('<i class="field-icon icon-chat"></i>');
$(".icon-class .CountryId").prepend('<i class="field-icon icon-State--city"></i>');
$(".icon-class .StateId").prepend('<i class="field-icon icon-State--city"></i>');
$(".icon-class .CityId").prepend('<i class="field-icon icon-State--city"></i>');
$(".icon-class .reg_field_gender_div").prepend('<i class="field-icon icon-name"></i>');
$(".icon-class .reg_university_id_div").prepend('<i class="field-icon icon-school"></i>');
$(".icon-class .CourseId").prepend('<i class="field-icon icon-course"></i>');
$(".icon-class .reg_specialization_id_div").prepend('<i class="field-icon icon-course"></i>');
$(".icon-class .reg_field_qualification_level_div").prepend('<i class="field-icon icon-course"></i>');
$(".icon-class .reg_field_discipline_div").prepend('<i class="field-icon icon-course"></i>');
$(".icon-class #loginForm .form-group:nth-child(2)").prepend('<i class="field-icon icon-Email"></i>');
$(".icon-class #loginForm .form-group:nth-child(3)").prepend('<i class="field-icon icon-password"></i>');
$(".icon-class #forgotForm .form-group.label-floating").prepend('<i class="field-icon icon-Email"></i>');
$(".icon-class #resendVlinkForm > div.form-group.label-floating").prepend('<i class="field-icon icon-Email"></i>');
/** End JS for input Icons **/

/** Start JS for add class in button parent div **/

$(document).ready(function(){
  $('#registerBtn').wrap('<div style="text-align:center;" class="register-parent"></div>');
  $('#loginBtn').wrap('<div style="text-align:center;" class="register-parent"></div>');
  $('#forgotBtn').wrap('<div style="text-align:center;" class="register-parent"></div>');
  $('#resendVlinkBtn').wrap('<div style="text-align:center;" class="register-parent"></div>');
  $('#forgotOtpBtn').wrap('<div style="text-align:center;" class="register-parent"></div>');
  });

/** End JS for add class in button parent div **/

/** Start bottom to top JS **/
$(document).ready(function(){ 
    $(window).scroll(function(){ 
        if ($(this).scrollTop() > 100) { 
            $('#scroll').fadeIn(); 
        } else { 
            $('#scroll').fadeOut(); 
        } 
    }); 
    $('#scroll').click(function(){ 
        $("html, body").animate({ scrollTop: 0 }, 600); 
        return false; 
    }); 
    $('.top_link').click(function(){ 
      $("html, body").animate({ scrollTop: 0 }, 600); 
      return false; 
  }); 

});
/** End bottom to top JS  **/

/* Start JS for Add Class on hover in step to follow and instruction section */ 

$(".step-colum").hover(function () {
    $('.stepsicoprocess').toggleClass("steps_hover");
});
$(".instruction-content").hover(function () {
  $('.stepsicoguide').toggleClass("guide_hover");
});      
$(".instruction-content").hover(function () {
  $('.instruction_ul').toggleClass("li_hover");
});  
/* End JS for Add Class on hover */


 $(window).scroll(function() {
            var scroll = $(window).scrollTop();

            if (scroll >= 480) {
                $(".form-sec").addClass("sticky  ");
                $(".fixed-enquiry-btn").addClass("sticky ");
            } else {
                $(".form-sec, .fixed-enquiry-btn").removeClass("sticky  ");

            }
        });
        $(".fixed-enquiry-btn").click(function() {
            $(".form-sec").toggleClass("formbottom ");
        })

        if ($(window).width() > 767) {

            $(".fixed-enquiry-btn a").on("click", function(event) {
                event.preventDefault()
            });


        }
