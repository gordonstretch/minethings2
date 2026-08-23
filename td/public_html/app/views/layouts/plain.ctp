<? header( 'Cache-control: no-cache' ); ?>

<head>
<title><?php echo $title_for_layout?></title>


<style type="text/css">
.submenu{display: none;}
</style>

<? 
echo $javascript->link('popup.js'); 
echo $javascript->link('menu.js');
echo $javascript->link('batteryTimer.js');
?>


</head>

<!-- make it obvious whether we are in debug or release -->
<?
if ($debug)
	$bgcolor='#CC9999';
else
	$bgcolor='#E5E596';
?>

<body bgcolor='<? echo $bgcolor; ?>'>

<!-- body div (debug data goes outside of here) -->
<div>

<!-- menu layer is on top -->
<div style="position:absolute; z-index=1;">


<table>
<? 
$toolbar = array();
$toolbar[] = $html->link($currentCityName, '/'); 
if ($miner)
{
	$toolbar[] = $html->link('My Things', );

	$mineLink = $html->link('My Mines', '/mines/check_mines'); 
	if ($hasRipeMine)
		$mineLink = array($mineLink, array('bgcolor' => '#ffcc33'));
	$toolbar[] = $mineLink;

	$toolbar[] = $html->link('My Vehicles', '/vehicles/browse/');

	$messageLinkName = 'My Messages';
	if (isset($numUnreadMessages) and $numUnreadMessages > 0)
		$messageLinkName.=" ($numUnreadMessages)";
	$toolbar[] = $html->link($messageLinkName, '/messages/list_all'); 

	$toolbar[] = $html->link('My Profession', '/miners/profession');

	$toolbar[] = $html->link('My Account', '/miners/account');

	$toolbar[] = "(".$html->link("logout", '/miners/logout').")"; 
}
else
{
	$toolbar[] = "(".$html->link("login", '/miners/login');
	$toolbar[] = $html->link("register", '/applicants/register').")";
}
echo $html->tableCells(array($toolbar));
?>
</table>

<table>
<?
$toolbar = array();
$toolbar[] = $html->link('Miners', '/miners/list_miners'); 
$toolbar[] = $html->link('Mines', '/mine_types/browse'); 

// City menu
$mapLinkHref = array(
		'controller' => 'miners',
		'action' => 'map',
		$redirect,
	); 
$citiesMenu = '<div id="topmenu">
	<div class="menutitle">'
	.$html->link('Cities', $mapLinkHref, array('OnClick' => "SwitchMenu('sub1'); return false;"))
	.'</div>
	<span class="submenu" id="sub1">';
$citiesMenu.= '<table border=1 bgcolor='.$bgcolor.'>';
$menuItems = array();
foreach($cities as $id => $c)
	if ($id == $currentCityId)
		$menuItems[] = $c;
	else
		$menuItems[] = $html->link($c, '/miners/change_city/'.$id.'/'.$redirect);
$menuItems[] = $html->link('Map', $mapLinkHref, array( 'target' => 'map_popup', 'OnClick' => "CollapseMenu(); OpenMap(this.href);"));
foreach($menuItems as $m)
	$citiesMenu.= $html->tableCells(array($m));
$citiesMenu.= '</table>';
$citiesMenu.= '</span>';
$citiesMenu.= '</div>';
$toolbar[] = $citiesMenu;

$toolbar[] = $html->link('Shop', '/credits/shop');
$toolbar[] = $html->link('Forums', '/miners/forums');
$toolbar[] = $html->link('Facebook', '/facebook/index');
$toolbar[] = $html->link('Help', '/miners/help');
if ($isAdministrator) 
	$toolbar[] = $html->link('Admin', '/admins'); 

$alignedToolbar = array();
foreach($toolbar as $t)
	$alignedToolbar[] = array($t, 'valign=top');
echo $html->tableCells(array($alignedToolbar));
?>
</table>

<!-- end menu layer -->
</div>

<div>
<br>
<br>
<br>
<? if (isset($miner['Miner'])) 
{
	print $miner['Miner']['name']."<br>"; 
	print "Gold: ".$market->commatize($miner['Miner']['gold']).". - "; 
	print "Credits: ".$miner['Miner']['credits'].". - ";
	print "Batteries: ";
	?><script language="Javascript">PrintBatterySpan(); SetBatteryLife(<? echo $batteryLifeSEC; ?>);</script>.<?
}
?>
<br>
<br>
<? echo $content_for_layout; ?>

</div> <!-- content div -->
</div> <!-- body div -->

</body>