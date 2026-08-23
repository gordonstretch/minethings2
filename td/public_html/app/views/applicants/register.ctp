<?
echo $html->image('home_bg.jpg');
?>

<!-- everything in here -->
<div style="position:relative; top:-270px;">

<div style="position:absolute; left:68px; width:355px; ">
<span style="font-family:arial; font-weight:500; font-size:14px; line-height:18px; color:#FFFFFF;">
The first humans are back on Earth, having lived on Mars for 2000 years.  They escaped the most catastrophic volcano eruption in recorded history: Yellowstone. <BR>
<BR>
Join the fastest-growing persistent-world PVP browser game of collecting, trading and pirates.  There are multiple mine types including weapons, vehicles and explosives.  You can trade your items or pillage other players to build wealth of your own.
</span>
</div>

<div style="position:absolute; left:483px;"> <!-- REGISTRATION FORM -->
<span style="font-family:arial; font-size:14px; color:#352308">
Free to register, no fees, no ads.<BR>
</span>
<?
echo $form->create("Applicant", array('url' => '/applicants/register'))."\n";
echo $form->input("name", array(
	'label' => false, 
	'div' => 'lp_div', 
	'class' => 'lp_input',
	'error' => array('wrap' => 'span', 'class' => 'lp_error'),
	'onblur' => 'onInputBlur(this, document.getElementById(\'nameLabel\'))',
	'before' => '<input id=nameLabel type="text" value="Type your user name" class="lp_label" onfocus="onInputFocus(document.getElementById(\'ApplicantName\'), this)" />',
	'escape' => false,
	))."\n";
echo $form->input("password", array(
	'type' => 'password', 
	'label' => false, 
	'div' => 'lp_div', 
	'class' => 'lp_input',
	'error' => array('wrap' => 'span', 'class' => 'lp_error'),
	'onblur' => 'onInputBlur(this, document.getElementById(\'passwordLabel\'))',
	'before' => '<input id=passwordLabel type="text" value="Password" class="lp_label" onfocus="onInputFocus(document.getElementById(\'ApplicantPassword\'), this)" />',
	'escape' => false,
	))."\n";
echo $form->input("password_confirm", array(
	'type' => 'password', 
	'label' => false, 
	'div' => 'lp_div', 
	'class' => 'lp_input',
	'error' => array('wrap' => 'span', 'class' => 'lp_error'),
	'onblur' => 'onInputBlur(this, document.getElementById(\'passwordConfirmLabel\'))',
	'before' => '<input id=passwordConfirmLabel type="text" value="Confirm password" class="lp_label" onfocus="onInputFocus(document.getElementById(\'ApplicantPasswordConfirm\'), this)" />',
	'escape' => false,
	))."\n";
echo $form->end(array('label' => 'Register', 'div' => array('class' => 'lp_div')))."\n";
?>
</div> <!-- END REGISTRATION FORM -->

<div style="position:absolute; left:483px; top:170px; width:320px;"> <!-- ToS -->
<span style="font-family:arial; font-size:9px; color:#FFFFFF">
It is a strictly-enforced policy at minethings.com that each person only have one account. Shill detection is currently <b>active</b>. Violators will have all of their accounts deleted immediately with no further recourse.
</span>
</div>




</div> <!-- end everything div -->

