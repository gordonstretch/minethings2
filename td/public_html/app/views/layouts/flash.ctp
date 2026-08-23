<?php
header("Cache-Control: no-cache, must-revalidate"); // HTTP/1.1
header("Expires: Sat, 26 Jul 1997 05:00:00 GMT"); // Date in the past
?>

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">

<!--Head-->
<head>

<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    
<title><?php echo $page_title; ?></title>

<?php if(Configure::read() == 0) { ?>
<meta http-equiv="Refresh" content="<?php echo $pause?>;url=<?php echo $url?>"/>
<?php } ?> 


<!--Links to stylesheets/js-->
<?
echo $html->css($stylesCSS);
if (isset($javascript))
{
	echo $javascript->link('popup.js'); 
	echo $javascript->link('menu.js');
	echo $javascript->link('batteryTimer.js');
}
?>


</head>
<!--End Head-->

<!--Body-->
<body>

<? include 'header.inc'; ?>
<? include 'horiz_menu.inc'; ?>

<div id="divwrapper">
        
<? include 'vert_menu.inc'; ?>

<!--Content Column-->
<div id="content">

<div style="text-align:center;">
<span style="font-weight:bold;font-size:24px">
<a href="<?php echo $url?>"><?php echo $message?></a>
</span>
</div>

</div>
<!--End Content Column-->

</div> <!-- End Div Wrapper -->
    
<!--Footer-->
<div id="footer">
        <p> © 2009 MineThings </p>
</div>
<!--End Footer-->


</div> <!-- End Wrapper -->


</body>
</html>
