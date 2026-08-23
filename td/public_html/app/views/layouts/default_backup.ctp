<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">

<!--Head-->
<head>

<!--Favicon-->
<? echo $html->meta('icon', '/app/img/favicon.ico', array('rel' => 'shortcut icon')); ?>

<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>Welcome to Mine Things!</title>
    
<!--Meta tags-->
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1" />
<meta name="Description" content="Insert description here" />
<meta name="Keywords" content="free game browser rpg mmorpg mine things" />

<!--Links to stylesheets/js-->
<?
echo $html->css('styles');
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
<div id="preloader">
<?
echo $html->image('home_h.gif', array('alt' => 'home preload'));
echo $html->image('miners_h.gif', array('alt' => 'miners preload'));
echo $html->image('mines_h.gif', array('alt' => 'mines preload'));
echo $html->image('map_h.gif', array('alt' => 'map preload'));
echo $html->image('shop_h.gif', array('alt' => 'shop preload'));
echo $html->image('forums_h.gif', array('alt' => 'forums preload'));
echo $html->image('facebook_h.gif', array('alt' => 'facebook preload'));
echo $html->image('help_h.gif', array('alt' => 'help preload'));
?>
</div>
<div id="wrapper">
    
<div id="header"> <!--Header-->
    
    <div id="corner-right"></div>
    
<div id="logo"> <!--Logo-->
	<div id="corner-left"></div>
</div> <!--End Logo -->

<? if (isset($miner['Miner'])):?>

<div id="login"> <!-- Logged In View -->
    
		<div class="logged-in">
		<b><? echo $miner['Miner']['name']; ?></b> (<? echo $miner['Miner']['meld_count']; ?>) | 
		<b><? echo $market->commatize($miner['Miner']['gold']); ?> gold</b> | 
		<b><? echo $miner['Miner']['credits']; ?> credits</b> | 
		Batteries: <script language="Javascript">PrintBatterySpan(); SetBatteryLife(<? echo $batteryLifeSEC; ?>);</script>.
        </div>
        <? echo $html->image('button_logout.jpg', array('id' => 'logout', 'alt' => 'logout', 'url' => '/miners/logout')); ?>
        
</div> <!-- End Logged In View -->

<? else: ?>

<div id="login"> <!-- Login -->
    <? //if  ($session->check('Message.auth')) $session->flash('auth'); ?>
    <? if (isset($loginMessage)) echo "<span>$loginMessage</span>"; ?>
    <span class="register">Not a member? <? echo $html->link('Register!', '/applicants/register'); ?></span>
    
		<div class="loginContent">
			<?
			echo $form->create('Miner', array('action' => 'login'));
			echo $form->input('name', array('class' => 'field', 'div' => false));
			echo $form->input('password', array('class' => 'field', 'div' => false));
			echo $form->end(array('label' => ' ', 'class' => 'button_login', 'div' => false, ));
			?>
			<!--<form action="#" method="post">
				<label for="log">Name:</label>
				<input class="field" type="text" name="log" id="log" value="" size="15" />
				<label for="pwd">Password:</label>
				<input class="field" type="password" name="pwd" id="pwd" size="15" />
				<input type="submit" name="submit" value="" class="button_login" />
				<input type="hidden" name="redirect_to" value=""/>
                <label for="rememberme"><input name="rememberme" id="rememberme" class="rememberme" type="checkbox" checked="checked" value="forever" /> Remember me</label>
             </form>-->
        </div>
        
</div> <!-- End Login -->

<? endif ?> <!-- if logged in -->

</div> <!--End Header-->


<!--Top Navigation-->
<div id="preloadedImages"></div>


<?
// Prepare Cities Menu

$mapLinkHref = array(
		'controller' => 'miners',
		'action' => 'map',
		$redirect,
	); 
$citiesMenuLink = '<div id="topmenu">
	<div class="menutitle">'
	.$html->link('Cities', $mapLinkHref, array('OnClick' => "SwitchMenu('sub1'); return false;"))
	.'</div></div>';

$citiesMenu = '<div id="submenu", style="position:absolute; top:220px; left:560px; ">';
$citiesMenu.= '<span class="submenu" id="sub1">';
$citiesMenu.= '<table border=1 bgcolor="#804E0F">';
$menuItems = array();
foreach($cities as $id => $c)
	if ($id == $currentCityId)
		$menuItems[] = '<font style="color:white;">'.$c.'</font>';
	else
		$menuItems[] = $html->link($c, '/miners/change_city/'.$id.'/'.$redirect, array('style' => 'color:white;'));
$menuItems[] = $html->link('Map', $mapLinkHref, array( 'target' => 'map_popup', 'OnClick' => "CollapseMenu(); OpenMap(this.href);", 'style' => 'color:white;'));
foreach($menuItems as $m)
	$citiesMenu.= $html->tableCells(array($m));
$citiesMenu.= '</table>';
$citiesMenu.= '</span>';
$citiesMenu.= '</div>';
?>

<div id="navcontainer">

<ul id="nav">
	<li> <? echo $html->image(strtolower($currentCityName).'.gif'); ?></li>
	<li class="home"><? echo $html->link('', '/'); ?></a></li>
	<li class="miners"><? echo $html->link('', '/miners/list_miners'); ?></li>
	<li class="mines"><? echo $html->link('', '/mine_types/browse'); ?></li>

	<!-- <li class="map"><? echo $html->link('', ''); ?></li> -->
	<li class="map"><? echo $citiesMenuLink; ?></li><? echo $citiesMenu; ?>

	<li class="shop"><? echo $html->link('', '/credits/shop'); ?></li>
	<li class="forums"><? echo $html->link('', '/miners/forums/'); ?></li>
	<li class="facebook"><? echo $html->link('', '/facebook/index'); ?></li>
	<li class="help"><? echo $html->link('', '/miners/help'); ?>	</li>
	</ul>
</div>
 
<!--End Top Navigation-->   

<div id="divwrapper">

<!--Left Navigation Column-->
<div id="left">
	
	<ul id="navlist">
	
	<li id="active"><? echo $html->link('Things', isset($miner) ? '/miners/show_items/'.$miner['Miner']['name'] : ''); ?></li>

	<?
	$findingText = 'Findings';
	if (isset($hasRipeMine) and $hasRipeMine)
		$findingText = ">>> ".$findingText;
	?>
	<li><?echo $html->link($findingText, '/mines/check_mines'); ?></li>

	<li><? echo $html->link('Vehicles', '/vehicles/browse/'); ?></li>

	<?
	$messageLinkName = 'Messages';
	if (isset($numUnreadMessages) and $numUnreadMessages > 0)
		$messageLinkName.=" ($numUnreadMessages)";
	?>
	<li><? echo $html->link($messageLinkName, '/messages/list_all'); ?></li>

	<li><? echo $html->link('Profession', '/miners/profession'); ?></li>
	<li><? echo $html->link('Account', '/miners/account'); ?></li>
	
	<? if (!isset($miner)): ?>
	<li><? echo $html->link('Register', '/applicants/register'); ?></li>
	<? endif ?>

	<? if( $isAdministrator ): ?>
	<li><? echo $html->link('Admin', '/admins/'); ?></li>
	<? endif ?>

	</ul>
</div>
<!--End Left Navigation Column-->

        
<!--Content Column-->
<div id="content">
<? echo $content_for_layout; ?>
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
